import express, { type Request, type Response } from 'express';
import type { Reservation } from '@prisma/client';
import QRCode from 'qrcode';
import { fileURLToPath } from 'url';
import { createServer } from 'node:http';
import { prisma } from './prismaClient.js';
import { verifySession } from '../auth/verifySession.js';
import { getDiningAvailability } from './availability.js';
import { createHold, releaseHold, getHoldById, extendHold } from './holds.js';
import { attachDiningRealtime } from './realtime.js';

const app = express();

app.use(express.json());

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const MAX_RESERVATION_OFFSET_DAYS = 180;

function normalizeDate(value: unknown): string | null {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    return null;
  }
  const instance = new Date(`${value}T00:00:00`);
  if (Number.isNaN(instance.getTime())) {
    return null;
  }
  return value;
}

function normalizeTime(value: unknown): string | null {
  if (typeof value !== 'string' || !TIME_PATTERN.test(value)) {
    return null;
  }
  return value;
}

function combineSlot(date: string, time: string): Date | null {
  const candidate = new Date(`${date}T${time}:00`);
  if (Number.isNaN(candidate.getTime())) {
    return null;
  }
  return candidate;
}

function isSlotInWindow(slot: Date): boolean {
  const now = new Date();
  const max = new Date();
  max.setDate(max.getDate() + MAX_RESERVATION_OFFSET_DAYS);
  return slot.getTime() >= now.getTime() && slot.getTime() <= max.getTime();
}

function normalizePartySize(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) {
    if (value >= 1 && value <= 12) {
      return value;
    }
    return null;
  }
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed) || parsed < 1 || parsed > 12) {
    return null;
  }
  return parsed;
}

function sanitizeText(value: unknown, maxLength = 500): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizePhone(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  const digits = trimmed.replace(/[^0-9+]/g, '');
  if (digits.length < 7) {
    return null;
  }
  return trimmed.slice(0, 40);
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }
  const email = value.trim();
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!EMAIL_PATTERN.test(email)) {
    return null;
  }
  return email.slice(0, 120);
}

function validateGuestPayload(payload: unknown): { guest: { phone: string; email: string; dietary: string; allergies: string; notes: string } } | { error: string; field?: string } {
  if (typeof payload !== 'object' || !payload) {
    return { error: 'Guest details missing' };
  }
  const record = payload as Record<string, unknown>;
  const phone = normalizePhone(record.phone);
  if (!phone) {
    return { error: 'A valid contact phone is required', field: 'phone' };
  }
  const email = normalizeEmail(record.email) ?? '';
  const dietary = sanitizeText(record.dietary);
  const allergies = sanitizeText(record.allergies);
  const notes = sanitizeText(record.notes, 800);
  return {
    guest: {
      phone,
      email,
      dietary,
      allergies,
      notes,
    },
  };
}

function tableSelectionsMatch(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((value, index) => value === sortedB[index]);
}

app.get('/api/dining/health', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.get('/api/dining/menu', async (_req: Request, res: Response) => {
  try {
    const sections = await prisma.menuSection.findMany({
      orderBy: { order: 'asc' },
      include: {
        items: {
          where: { active: true },
          orderBy: { name: 'asc' },
        },
      },
    });

    res.json({ sections });
  } catch (error) {
    console.error('Failed to fetch menu', error);
    res.status(500).json({ error: 'Failed to fetch menu' });
  }
});

app.get('/api/dining/tables', async (_req: Request, res: Response) => {
  try {
    const tables = await prisma.diningTable.findMany({
      where: { active: true },
      orderBy: { label: 'asc' },
    });
    res.json({ tables });
  } catch (error) {
    console.error('Failed to fetch dining tables', error);
    res.status(500).json({ error: 'Failed to fetch dining tables' });
  }
});

app.get('/api/dining/availability', async (req: Request, res: Response) => {
  try {
    const { date, time, partySize } = req.query;

    if (typeof date !== 'string' || typeof time !== 'string' || typeof partySize !== 'string') {
      res.status(400).json({ error: 'Missing or invalid parameters' });
      return;
    }

    const parsedPartySize = Number.parseInt(partySize, 10);
    if (Number.isNaN(parsedPartySize) || parsedPartySize <= 0) {
      res.status(400).json({ error: 'partySize must be a positive integer' });
      return;
    }

    const availability = await getDiningAvailability(date, time, parsedPartySize);
    res.json(availability);
  } catch (error) {
    console.error('Failed to compute dining availability', error);
    res.status(500).json({ error: 'Failed to compute dining availability' });
  }
});

app.post('/api/dining/reservations/validate', verifySession, async (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { step } = req.body ?? {};

  if (step === 'schedule') {
    const normalizedDate = normalizeDate(req.body?.date);
    const normalizedTime = normalizeTime(req.body?.time);
    if (!normalizedDate || !normalizedTime) {
      res.status(400).json({ error: 'Invalid date or time' });
      return;
    }
    const slot = combineSlot(normalizedDate, normalizedTime);
    if (!slot || !isSlotInWindow(slot)) {
      res.status(400).json({ error: 'Requested seating is unavailable' });
      return;
    }
    res.json({ date: normalizedDate, time: normalizedTime });
    return;
  }

  if (step === 'party') {
    const normalizedDate = normalizeDate(req.body?.date);
    const normalizedTime = normalizeTime(req.body?.time);
    const partySize = normalizePartySize(req.body?.partySize);
    if (!normalizedDate || !normalizedTime || !partySize) {
      res.status(400).json({ error: 'Invalid party request' });
      return;
    }
    const slot = combineSlot(normalizedDate, normalizedTime);
    if (!slot || !isSlotInWindow(slot)) {
      res.status(400).json({ error: 'Requested seating is unavailable' });
      return;
    }
    try {
      const availability = await getDiningAvailability(normalizedDate, normalizedTime, partySize);
      res.json({ partySize, availability });
    } catch (error) {
      console.error('Failed to validate party size', error);
      res.status(500).json({ error: 'Unable to validate party size' });
    }
    return;
  }

  if (step === 'guest') {
    const validation = validateGuestPayload(req.body?.guest);
    if ('error' in validation) {
      res.status(400).json(validation);
      return;
    }
    res.json(validation);
    return;
  }

  res.status(400).json({ error: 'Unsupported validation step' });
});

app.post('/api/dining/hold', verifySession, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { date, time, tableIds } = req.body ?? {};
    if (typeof date !== 'string' || typeof time !== 'string' || !Array.isArray(tableIds) || tableIds.length === 0) {
      res.status(400).json({ error: 'Invalid hold payload' });
      return;
    }

    const availability = await getDiningAvailability(date, time, 1);
    const unavailable = tableIds.filter((id: string) => !availability.availableTableIds.includes(id));
    if (unavailable.length > 0) {
      res.status(409).json({ error: 'Some tables are no longer available', tables: unavailable });
      return;
    }

    const result = await createHold({ date, time, tableIds, userId: req.user.id });
    if ('error' in result) {
      res.status(409).json({ error: result.error });
      return;
    }

    res.status(201).json({ holdId: result.hold.holdId, expiresAt: result.hold.expiresAt });
  } catch (error) {
    console.error('Failed to create dining hold', error);
    res.status(500).json({ error: 'Failed to create hold' });
  }
});

app.post('/api/dining/release', verifySession, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { holdId, extend } = req.body ?? {};
    if (typeof holdId !== 'string') {
      res.status(400).json({ error: 'holdId is required' });
      return;
    }

    const hold = await getHoldById(holdId);
    if (!hold) {
      res.status(404).json({ error: 'Hold not found' });
      return;
    }

    if (hold.userId !== req.user.id) {
      res.status(403).json({ error: 'Cannot modify another user\'s hold' });
      return;
    }

    if (extend === true) {
      const extended = await extendHold(holdId);
      if (!extended) {
        res.status(500).json({ error: 'Failed to extend hold' });
        return;
      }
      res.json({ holdId, expiresAt: extended.expiresAt });
      return;
    }

    const released = await releaseHold(holdId);
    if (!released) {
      res.status(500).json({ error: 'Failed to release hold' });
      return;
    }

    res.json({ released: true });
  } catch (error) {
    console.error('Failed to release dining hold', error);
    res.status(500).json({ error: 'Failed to release hold' });
  }
});

app.post('/api/dining/reservations', verifySession, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const normalizedDate = normalizeDate(req.body?.date);
    const normalizedTime = normalizeTime(req.body?.time);
    const partySize = normalizePartySize(req.body?.partySize);
    const tableIdsRaw = Array.isArray(req.body?.tableIds) ? req.body.tableIds.map((value: unknown) => String(value)) : [];
    const holdId = typeof req.body?.holdId === 'string' ? req.body.holdId : null;
    const guestValidation = validateGuestPayload(req.body?.guest);

    if (!normalizedDate || !normalizedTime || !partySize || !holdId) {
      res.status(400).json({ error: 'Invalid reservation payload' });
      return;
    }

    if ('error' in guestValidation) {
      res.status(400).json(guestValidation);
      return;
    }

    if (!Array.isArray(tableIdsRaw) || tableIdsRaw.length === 0) {
      res.status(400).json({ error: 'Table selection missing' });
      return;
    }

    const slot = combineSlot(normalizedDate, normalizedTime);
    if (!slot || !isSlotInWindow(slot)) {
      res.status(400).json({ error: 'Requested seating is unavailable' });
      return;
    }

    const hold = await getHoldById(holdId);
    if (!hold) {
      res.status(404).json({ error: 'Hold not found' });
      return;
    }

    if (hold.userId !== req.user.id) {
      res.status(403).json({ error: 'Cannot confirm another guest\'s hold' });
      return;
    }

    if (hold.expiresAt <= Date.now()) {
      await releaseHold(hold.holdId);
      res.status(410).json({ error: 'Hold has expired. Please choose new tables.' });
      return;
    }

    if (hold.date !== normalizedDate || hold.time !== normalizedTime) {
      res.status(400).json({ error: 'Hold does not match the selected time' });
      return;
    }

    if (!tableSelectionsMatch(hold.tableIds, tableIdsRaw)) {
      res.status(400).json({ error: 'Table selection does not match held tables' });
      return;
    }

    const tables = await prisma.diningTable.findMany({
      where: { id: { in: hold.tableIds } },
      orderBy: { label: 'asc' },
    });

    if (tables.length !== hold.tableIds.length) {
      await releaseHold(hold.holdId);
      res.status(409).json({ error: 'Some tables are no longer available. Please reselect.' });
      return;
    }

    const totalCapacity = tables.reduce((sum, table) => sum + table.capacity, 0);
    if (totalCapacity < partySize) {
      res.status(400).json({ error: 'Selected tables cannot accommodate the party' });
      return;
    }

    const existingReservations = await prisma.reservation.findMany({
      where: {
        status: { not: 'CANCELLED' },
        date: new Date(`${normalizedDate}T00:00:00`),
        time: normalizedTime,
      },
    });

    const conflict = existingReservations.some((reservation) =>
      reservation.tableIds.some((tableId) => hold.tableIds.includes(tableId)),
    );

    if (conflict) {
      await releaseHold(hold.holdId);
      res.status(409).json({ error: 'Those tables were just taken. Please choose new seats.' });
      return;
    }

    const reservation = await prisma.reservation.create({
      data: {
        userId: req.user.id,
        date: new Date(`${normalizedDate}T00:00:00`),
        time: normalizedTime,
        partySize,
        tableIds: [...hold.tableIds],
        dietaryPrefs: guestValidation.guest.dietary || null,
        allergies: guestValidation.guest.allergies || null,
        contactPhone: guestValidation.guest.phone,
        contactEmail: guestValidation.guest.email || null,
        notes: guestValidation.guest.notes || null,
      },
    });

    await releaseHold(hold.holdId);

    const qrPayload = {
      id: reservation.id,
      date: normalizedDate,
      time: normalizedTime,
      partySize,
      tableIds: hold.tableIds,
    };

    const qrCode = await QRCode.toDataURL(JSON.stringify(qrPayload), {
      errorCorrectionLevel: 'M',
      margin: 1,
      scale: 6,
    });

    res.status(201).json({
      reservation: {
        id: reservation.id,
        date: normalizedDate,
        time: normalizedTime,
        partySize,
        tables: tables.map((table) => ({ id: table.id, label: table.label, capacity: table.capacity })),
        dietaryPrefs: reservation.dietaryPrefs,
        allergies: reservation.allergies,
        notes: reservation.notes,
        contactPhone: reservation.contactPhone,
        contactEmail: reservation.contactEmail,
        qrCode,
      },
    });
  } catch (error) {
    console.error('Failed to create reservation', error);
    res.status(500).json({ error: 'Failed to create reservation' });
  }
});

app.get('/api/dining/reservations/me', verifySession, async (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const reservations: Reservation[] = await prisma.reservation.findMany({
      where: { userId: req.user.id },
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
    });

    res.json({ reservations });
  } catch (error) {
    console.error('Failed to fetch reservations', error);
    res.status(500).json({ error: 'Failed to fetch reservations' });
  }
});

const PORT = Number(process.env.DINING_PORT ?? process.env.PORT ?? 4000);

export { app };

if (process.argv[1]) {
  const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
  if (isMainModule) {
    const server = createServer(app);
    attachDiningRealtime(server);
    server.listen(PORT, () => {
      console.log(`Dining API server listening on port ${PORT}`);
    });
  }
}

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
