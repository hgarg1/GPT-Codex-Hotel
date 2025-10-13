import express, { type Request, type Response } from 'express';
import cors, { type CorsOptions } from 'cors';
import QRCode from 'qrcode';
import { fileURLToPath } from 'url';
import { createServer } from 'node:http';
import helmet from 'helmet';
import { verifySession } from '../auth/verifySession.js';
import { getDiningAvailability } from './availability.js';
import { createHold, releaseHold, getHoldById, extendHold } from './holds.js';
import { attachDiningRealtime } from './realtime.js';
import { requireAdmin } from './requireAdmin.js';
import type { AuthenticatedUser } from '../auth/verifySession.js';
import type { DiningReservation } from './types.js';
import {
  ensureDiningUserRecord as persistDiningUser,
  listAdminReservations,
  listReservationsBetween,
  listTables,
  getTablesByIds,
  createDiningTable,
  updateDiningTables,
  listMenuSections,
  createMenuSection,
  createMenuItem,
  updateMenuSection,
  updateMenuItem,
  deleteMenuSection,
  deleteMenuItem,
  loadDiningConfig,
  updateDiningConfig,
  listReservationsForSlot,
  createReservation,
  listReservationsForUser,
} from './data.js';

const app = express();

function normalizeOrigin(origin: string): string {
  try {
    const url = new URL(origin);
    return `${url.protocol}//${url.host}`;
  } catch (error) {
    return origin;
  }
}

const allowedOrigins = new Set<string>();

function registerCorsOrigin(origin: string | undefined | null): void {
  if (!origin) return;
  origin
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .forEach((value) => {
      const normalized = normalizeOrigin(value);
      allowedOrigins.add(normalized);
      if (normalized.startsWith('http://')) {
        allowedOrigins.add(normalized.replace('http://', 'https://'));
      }
      if (normalized.startsWith('https://')) {
        allowedOrigins.add(normalized.replace('https://', 'http://'));
      }
    });
}

const hotelPort = Number(process.env.PORT ?? 3000);
registerCorsOrigin(`http://localhost:${hotelPort}`);
registerCorsOrigin(`http://127.0.0.1:${hotelPort}`);
registerCorsOrigin(process.env.PUBLIC_BASE_URL ?? null);
registerCorsOrigin(process.env.DINING_ALLOWED_ORIGINS ?? null);
registerCorsOrigin(process.env.SOCKET_ORIGIN ?? null);
registerCorsOrigin(process.env.SOCKET_ORIGINS ?? null);

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }
    const normalized = normalizeOrigin(origin);
    if (allowedOrigins.has(normalized)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origin not allowed by CORS'));
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

app.set('trust proxy', true);
app.disable('x-powered-by');

const connectSrc = new Set(["'self'", 'https:', 'wss:', 'ws:']);

function addOrigin(origin: string | undefined | null) {
  if (!origin) return;
  origin
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .forEach((value) => {
      try {
        const url = new URL(value);
        connectSrc.add(`${url.protocol}//${url.host}`);
      } catch (error) {
        connectSrc.add(value);
      }
    });
}

addOrigin(process.env.SOCKET_ORIGIN);
addOrigin(process.env.SOCKET_ORIGINS);
addOrigin(process.env.PUBLIC_BASE_URL);

const cspDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'", "'unsafe-inline'"],
  styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  imgSrc: ["'self'", 'data:', 'https:'],
  connectSrc: Array.from(connectSrc),
  fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
};

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: cspDirectives,
    },
    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin',
    },
    crossOriginEmbedderPolicy: false,
  }),
);

app.use(helmet.hsts({ maxAge: 31536000, includeSubDomains: true }));
app.use(helmet.noSniff());
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use(express.json());
app.use('/api/admin', verifySession, requireAdmin);

async function ensureDiningUserRecord(user: AuthenticatedUser | undefined) {
  if (!user?.id || !user.email) {
    return;
  }
  try {
    await persistDiningUser({ id: user.id, email: user.email, name: user.name ?? null });
  } catch (error) {
    console.error('Failed to synchronise dining user', error);
    throw new Error('Dining profile unavailable');
  }
}

app.get('/api/admin/dining/reservations', async (req: Request, res: Response) => {
  try {
    const { date, time, status, zone } = req.query;

    const normalizedStatus =
      typeof status === 'string' && status.trim().length > 0 ? status.trim().toUpperCase() : undefined;

    let normalizedDate: string | undefined;
    if (typeof date === 'string') {
      normalizedDate = normalizeDate(date);
      if (!normalizedDate) {
        res.status(400).json({ error: 'Invalid date filter' });
        return;
      }
    }

    let normalizedTime: string | undefined;
    if (typeof time === 'string') {
      normalizedTime = normalizeTime(time);
      if (!normalizedTime) {
        res.status(400).json({ error: 'Invalid time filter' });
        return;
      }
    }

    const reservations = await listAdminReservations({
      status: normalizedStatus,
      date: normalizedDate,
      time: normalizedTime,
    });

    const tableMap = await getTableMap(reservations.flatMap((reservation) => reservation.tableIds));
    const normalizedZone = typeof zone === 'string' && zone.trim().length > 0 ? zone.trim().toLowerCase() : null;

    const payload = reservations
      .map((reservation) => {
        const tables = mapReservationTables(reservation, tableMap);
        return {
          id: reservation.id,
          date: reservation.date.toISOString().slice(0, 10),
          time: reservation.time,
          status: reservation.status,
          partySize: reservation.partySize,
          tableIds: reservation.tableIds,
          tables,
          contactPhone: reservation.contactPhone,
          contactEmail: reservation.contactEmail,
          dietaryPrefs: reservation.dietaryPrefs,
          allergies: reservation.allergies,
          notes: reservation.notes,
          user: reservation.user,
          createdAt: reservation.createdAt,
        };
      })
      .filter((reservation) => {
        if (!normalizedZone) {
          return true;
        }
        return reservation.tables.some((table) => (table.zone ?? '').toLowerCase() === normalizedZone);
      });

    res.json({ reservations: payload });
  } catch (error) {
    console.error('Failed to fetch admin reservations', error);
    res.status(500).json({ error: 'Failed to fetch reservations' });
  }
});

app.get('/api/admin/dining/reservations/export', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const normalizedStart = normalizeDate(startDate);
    const normalizedEnd = normalizeDate(endDate);

    if (!normalizedStart || !normalizedEnd) {
      res.status(400).json({ error: 'Valid startDate and endDate are required' });
      return;
    }

    const start = new Date(`${normalizedStart}T00:00:00`);
    const end = new Date(`${normalizedEnd}T23:59:59`);

    if (end.getTime() < start.getTime()) {
      res.status(400).json({ error: 'endDate must be after startDate' });
      return;
    }

    const reservations = await listReservationsBetween(
      normalizedStart,
      normalizedEnd,
    );

    const tableMap = await getTableMap(reservations.flatMap((reservation) => reservation.tableIds));

    const header = [
      'Reservation ID',
      'Date',
      'Time',
      'Status',
      'Guest Name',
      'Guest Email',
      'Contact Phone',
      'Party Size',
      'Tables',
      'Zones',
      'Notes',
    ];

    const lines = reservations.map((reservation) => {
      const tables = mapReservationTables(reservation, tableMap);
      const tableLabels = tables.map((table) => table.label).join(' | ');
      const zones = tables
        .map((table) => table.zone ?? '')
        .filter((value) => value.length > 0)
        .join(' | ');

      const columns = [
        reservation.id,
        reservation.date.toISOString().slice(0, 10),
        reservation.time,
        reservation.status,
        reservation.user?.name ?? '',
        reservation.user?.email ?? '',
        reservation.contactPhone ?? '',
        reservation.partySize.toString(),
        tableLabels,
        zones,
        (reservation.notes ?? '').replace(/\s+/g, ' ').trim(),
      ];
      return columns.map((value) => `"${value.replace(/"/g, '""')}` + '"').join(',');
    });

    const csv = [header.join(','), ...lines].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="reservations-${normalizedStart}-to-${normalizedEnd}.csv"`,
    );
    res.send(csv);
  } catch (error) {
    console.error('Failed to export reservations CSV', error);
    res.status(500).json({ error: 'Failed to export reservations' });
  }
});

app.get('/api/admin/dining/tables', async (_req: Request, res: Response) => {
  try {
    const tables = await listTables();
    res.json({ tables });
  } catch (error) {
    console.error('Failed to fetch admin dining tables', error);
    res.status(500).json({ error: 'Failed to fetch tables' });
  }
});

app.post('/api/admin/dining/tables', async (req: Request, res: Response) => {
  try {
    const { label, capacity, x, y, rotation, zone, active } = req.body ?? {};

    const normalizedLabel = sanitizeText(label, 60);
    const normalizedCapacity = normalizeInteger(capacity, { min: 1, max: 20 });
    const normalizedX = normalizeInteger(x, { min: 0, max: 2000 });
    const normalizedY = normalizeInteger(y, { min: 0, max: 2000 });
    const normalizedRotation = normalizeInteger(rotation ?? 0, { min: 0, max: 359 });
    const normalizedActive = typeof active === 'boolean' ? active : true;

    if (!normalizedLabel || !normalizedCapacity || normalizedX === null || normalizedY === null) {
      res.status(400).json({ error: 'Invalid table payload' });
      return;
    }

    const table = await createDiningTable({
      label: normalizedLabel,
      capacity: normalizedCapacity,
      x: normalizedX,
      y: normalizedY,
      rotation: normalizedRotation ?? 0,
      zone: normalizeOptionalText(zone, 40),
      active: normalizedActive,
    });

    res.status(201).json({ table });
  } catch (error) {
    console.error('Failed to create dining table', error);
    res.status(500).json({ error: 'Failed to create table' });
  }
});

app.patch('/api/admin/dining/tables', async (req: Request, res: Response) => {
  try {
    const updates = Array.isArray(req.body?.tables)
      ? req.body.tables
      : req.body && typeof req.body === 'object' && 'id' in req.body
        ? [req.body]
        : [];

    if (updates.length === 0) {
      res.status(400).json({ error: 'No table updates provided' });
      return;
    }

    const sanitizedUpdates = updates.map((update: Record<string, unknown>) => {
      const id = typeof update.id === 'string' ? update.id : null;
      if (!id) {
        throw new Error('Missing table id');
      }

      const data: Record<string, unknown> = { id };

      if (update.label !== undefined) {
        const value = sanitizeText(update.label, 60);
        if (!value) {
          throw new Error('Invalid label');
        }
        data.label = value;
      }

      if (update.capacity !== undefined) {
        const value = normalizeInteger(update.capacity, { min: 1, max: 20 });
        if (value === null) {
          throw new Error('Invalid capacity');
        }
        data.capacity = value;
      }

      if (update.x !== undefined) {
        const value = normalizeInteger(update.x, { min: 0, max: 2000 });
        if (value === null) {
          throw new Error('Invalid x coordinate');
        }
        data.x = value;
      }

      if (update.y !== undefined) {
        const value = normalizeInteger(update.y, { min: 0, max: 2000 });
        if (value === null) {
          throw new Error('Invalid y coordinate');
        }
        data.y = value;
      }

      if (update.rotation !== undefined) {
        const value = normalizeInteger(update.rotation, { min: 0, max: 359 });
        if (value === null) {
          throw new Error('Invalid rotation');
        }
        data.rotation = value;
      }

      if (update.zone !== undefined) {
        data.zone = normalizeOptionalText(update.zone, 40);
      }

      if (update.active !== undefined) {
        const value = normalizeBoolean(update.active);
        if (value === null) {
          throw new Error('Invalid active flag');
        }
        data.active = value;
      }

      if (Object.keys(data).length === 1) {
        throw new Error('No updatable fields provided');
      }

      return data;
    });

    const results = await updateDiningTables(sanitizedUpdates as Array<{
      id: string;
      label?: string;
      capacity?: number;
      x?: number;
      y?: number;
      rotation?: number;
      zone?: string | null;
      active?: boolean;
    }>);

    res.json({ tables: results });
  } catch (error) {
    console.error('Failed to update dining tables', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to update tables' });
  }
});

app.get('/api/admin/dining/menu', async (_req: Request, res: Response) => {
  try {
    const sections = await listMenuSections({ includeInactiveItems: true });

    res.json({ sections });
  } catch (error) {
    console.error('Failed to fetch admin menu', error);
    res.status(500).json({ error: 'Failed to fetch menu' });
  }
});

app.post('/api/admin/dining/menu', async (req: Request, res: Response) => {
  try {
    const { kind } = req.body ?? {};
    if (kind === 'section') {
      const title = sanitizeText(req.body?.title, 120);
      if (!title) {
        res.status(400).json({ error: 'Section title is required' });
        return;
      }
      const order = normalizeInteger(req.body?.order, { min: 0 });
      const sections = await listMenuSections({ includeInactiveItems: true });
      const currentMax = sections.reduce((max, section) => Math.max(max, section.order), -1);
      const nextOrder = order ?? currentMax + 1;
      const section = await createMenuSection({ title, order: nextOrder });
      res.status(201).json({ section });
      return;
    }

    if (kind === 'item') {
      const sectionId = typeof req.body?.sectionId === 'string' ? req.body.sectionId : null;
      const name = sanitizeText(req.body?.name, 160);
      const priceCents = normalizeInteger(req.body?.priceCents, { min: 0 });
      if (!sectionId || !name || priceCents === null) {
        res.status(400).json({ error: 'Invalid menu item payload' });
        return;
      }
      const item = await createMenuItem({
        sectionId,
        name,
        description: normalizeOptionalText(req.body?.description, 500),
        priceCents,
        vegetarian: normalizeBoolean(req.body?.vegetarian) ?? false,
        vegan: normalizeBoolean(req.body?.vegan) ?? false,
        glutenFree: normalizeBoolean(req.body?.glutenFree) ?? false,
        spicyLevel: normalizeInteger(req.body?.spicyLevel, { min: 0, max: 5 }) ?? 0,
        active: normalizeBoolean(req.body?.active) ?? true,
      });
      res.status(201).json({ item });
      return;
    }

    res.status(400).json({ error: 'Unsupported menu payload' });
  } catch (error) {
    console.error('Failed to create menu entry', error);
    res.status(500).json({ error: 'Failed to create menu entry' });
  }
});

app.patch('/api/admin/dining/menu/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { kind } = req.body ?? {};

    if (!id) {
      res.status(400).json({ error: 'Menu id is required' });
      return;
    }

    if (kind === 'section') {
      const data: Record<string, unknown> = {};
      if (req.body?.title !== undefined) {
        const title = sanitizeText(req.body.title, 120);
        if (!title) {
          res.status(400).json({ error: 'Section title is required' });
          return;
        }
        data.title = title;
      }
      if (req.body?.order !== undefined) {
        const order = normalizeInteger(req.body.order, { min: 0 });
        if (order === null) {
          res.status(400).json({ error: 'Invalid section order' });
          return;
        }
        data.order = order;
      }
      if (Object.keys(data).length === 0) {
        res.status(400).json({ error: 'No updates provided' });
        return;
      }
      const section = await updateMenuSection(id, data);
      res.json({ section });
      return;
    }

    if (kind === 'item') {
      const data: Record<string, unknown> = {};
      if (req.body?.name !== undefined) {
        const name = sanitizeText(req.body.name, 160);
        if (!name) {
          res.status(400).json({ error: 'Item name is required' });
          return;
        }
        data.name = name;
      }
      if (req.body?.description !== undefined) {
        data.description = normalizeOptionalText(req.body.description, 500);
      }
      if (req.body?.priceCents !== undefined) {
        const price = normalizeInteger(req.body.priceCents, { min: 0 });
        if (price === null) {
          res.status(400).json({ error: 'Invalid price' });
          return;
        }
        data.priceCents = price;
      }
      if (req.body?.vegetarian !== undefined) {
        const value = normalizeBoolean(req.body.vegetarian);
        if (value === null) {
          res.status(400).json({ error: 'Invalid vegetarian flag' });
          return;
        }
        data.vegetarian = value;
      }
      if (req.body?.vegan !== undefined) {
        const value = normalizeBoolean(req.body.vegan);
        if (value === null) {
          res.status(400).json({ error: 'Invalid vegan flag' });
          return;
        }
        data.vegan = value;
      }
      if (req.body?.glutenFree !== undefined) {
        const value = normalizeBoolean(req.body.glutenFree);
        if (value === null) {
          res.status(400).json({ error: 'Invalid glutenFree flag' });
          return;
        }
        data.glutenFree = value;
      }
      if (req.body?.spicyLevel !== undefined) {
        const spicy = normalizeInteger(req.body.spicyLevel, { min: 0, max: 5 });
        if (spicy === null) {
          res.status(400).json({ error: 'Invalid spicy level' });
          return;
        }
        data.spicyLevel = spicy;
      }
      if (req.body?.active !== undefined) {
        const active = normalizeBoolean(req.body.active);
        if (active === null) {
          res.status(400).json({ error: 'Invalid active flag' });
          return;
        }
        data.active = active;
      }
      if (Object.keys(data).length === 0) {
        res.status(400).json({ error: 'No updates provided' });
        return;
      }
      const item = await updateMenuItem(id, data);
      res.json({ item });
      return;
    }

    res.status(400).json({ error: 'Unsupported menu update' });
  } catch (error) {
    console.error('Failed to update menu entry', error);
    res.status(500).json({ error: 'Failed to update menu entry' });
  }
});

app.delete('/api/admin/dining/menu/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { kind } = req.query;
    if (!id) {
      res.status(400).json({ error: 'Menu id is required' });
      return;
    }
    if (kind === 'section') {
      await deleteMenuSection(id);
      res.status(204).send();
      return;
    }
    if (kind === 'item') {
      await deleteMenuItem(id);
      res.status(204).send();
      return;
    }
    res.status(400).json({ error: 'Menu kind must be specified as section or item' });
  } catch (error) {
    console.error('Failed to delete menu entry', error);
    res.status(500).json({ error: 'Failed to delete menu entry' });
  }
});

app.get('/api/admin/dining/config', async (_req: Request, res: Response) => {
  try {
    const config = await loadDiningConfig();
    res.json({ config });
  } catch (error) {
    console.error('Failed to load dining config', error);
    res.status(500).json({ error: 'Failed to load config' });
  }
});

app.post('/api/admin/dining/config', async (req: Request, res: Response) => {
  try {
    const current = await loadDiningConfig();
    const dwellMinutes =
      req.body?.dwellMinutes === undefined
        ? current.dwellMinutes
        : normalizeInteger(req.body?.dwellMinutes, { min: 15, max: 360 });
    if (dwellMinutes === null) {
      res.status(400).json({ error: 'Invalid dwellMinutes' });
      return;
    }

    const blackoutDatesRaw = Array.isArray(req.body?.blackoutDates)
      ? req.body.blackoutDates
      : current.blackoutDates;
    const blackoutDates = blackoutDatesRaw
      .map((value: unknown) => normalizeDate(value))
      .filter((value): value is string => Boolean(value));

    const policyTextValue =
      req.body?.policyText !== undefined ? normalizeOptionalText(req.body.policyText, 2000) : current.policyText;

    const updated = await updateDiningConfig({
      dwellMinutes,
      blackoutDates,
      policyText: policyTextValue ?? null,
    });

    res.json({ config: updated });
  } catch (error) {
    console.error('Failed to update dining config', error);
    res.status(500).json({ error: 'Failed to update config' });
  }
});

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

function normalizeOptionalText(value: unknown, maxLength = 500): string | null {
  const sanitized = sanitizeText(value, maxLength);
  return sanitized.length > 0 ? sanitized : null;
}

function normalizeInteger(
  value: unknown,
  { min, max }: { min?: number; max?: number } = {},
): number | null {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    return null;
  }
  if (typeof min === 'number' && parsed < min) {
    return null;
  }
  if (typeof max === 'number' && parsed > max) {
    return null;
  }
  return parsed;
}

function normalizeBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return null;
}

function mapReservationTables(
  reservation: DiningReservation,
  tableMap: Map<string, { id: string; label: string; capacity: number; zone: string | null; rotation: number }>,
) {
  return reservation.tableIds
    .map((id) => tableMap.get(id))
    .filter((table): table is { id: string; label: string; capacity: number; zone: string | null; rotation: number } =>
      Boolean(table),
    );
}

async function getTableMap(tableIds: string[]) {
  if (tableIds.length === 0) {
    return new Map<string, { id: string; label: string; capacity: number; zone: string | null; rotation: number }>();
  }
  const tables = await getTablesByIds(tableIds);
  return new Map(
    tables.map((table) => [
      table.id,
      { id: table.id, label: table.label, capacity: table.capacity, zone: table.zone ?? null, rotation: table.rotation },
    ]),
  );
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
    const sections = await listMenuSections({ includeInactiveItems: false });

    res.json({ sections });
  } catch (error) {
    console.error('Failed to fetch menu', error);
    res.status(500).json({ error: 'Failed to fetch menu' });
  }
});

app.get('/api/dining/tables', async (_req: Request, res: Response) => {
  try {
    const tables = await listTables({ activeOnly: true });
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

    await ensureDiningUserRecord(req.user);

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

    const tables = await getTablesByIds(hold.tableIds);
    tables.sort((a, b) => a.label.localeCompare(b.label));

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

    const existingReservations = await listReservationsForSlot(normalizedDate, normalizedTime);

    const conflict = existingReservations.some((reservation) =>
      reservation.tableIds.some((tableId) => hold.tableIds.includes(tableId)),
    );

    if (conflict) {
      await releaseHold(hold.holdId);
      res.status(409).json({ error: 'Those tables were just taken. Please choose new seats.' });
      return;
    }

    const reservation = await createReservation({
      userId: req.user.id,
      date: normalizedDate,
      time: normalizedTime,
      partySize,
      tableIds: [...hold.tableIds],
      dietaryPrefs: guestValidation.guest.dietary || null,
      allergies: guestValidation.guest.allergies || null,
      contactPhone: guestValidation.guest.phone,
      contactEmail: guestValidation.guest.email || null,
      notes: guestValidation.guest.notes || null,
    });

    if (!reservation) {
      throw new Error('Failed to create reservation');
    }

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
    await ensureDiningUserRecord(req.user);
    const reservations: DiningReservation[] = await listReservationsForUser(req.user.id);

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

