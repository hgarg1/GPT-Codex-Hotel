import express, { type Request, type Response } from 'express';
import type { Reservation } from '@prisma/client';
import { fileURLToPath } from 'url';
import { prisma } from './prismaClient.js';
import { verifySession } from '../auth/verifySession.js';

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
    app.listen(PORT, () => {
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
