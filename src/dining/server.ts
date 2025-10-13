import express, { type Request, type Response } from 'express';
import type { Reservation } from '@prisma/client';
import { fileURLToPath } from 'url';
import { createServer } from 'node:http';
import { prisma } from './prismaClient.js';
import { verifySession } from '../auth/verifySession.js';
import { getDiningAvailability } from './availability.js';
import { createHold, releaseHold, getHoldById, extendHold } from './holds.js';
import { attachDiningRealtime } from './realtime.js';

const app = express();

app.use(express.json());

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
