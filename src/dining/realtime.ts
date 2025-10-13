import { Server as HTTPServer } from 'node:http';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import type { HoldRecord } from './holds.js';
import { holdEvents } from './holds.js';

type SeatUpdatePayload = {
  date: string;
  time: string;
  tableIds: string[];
  status: 'held' | 'available';
  holdId?: string;
  expiresAt?: number;
  reason: 'hold.created' | 'hold.released' | 'hold.extended' | 'hold.expired';
};

let ioInstance: SocketIOServer | null = null;

function emitSeatUpdate(hold: HoldRecord, status: SeatUpdatePayload['status'], reason: SeatUpdatePayload['reason']): void {
  if (!ioInstance) return;
  const payload: SeatUpdatePayload = {
    date: hold.date,
    time: hold.time,
    tableIds: hold.tableIds,
    status,
    holdId: hold.holdId,
    expiresAt: hold.expiresAt,
    reason,
  };

  if (status === 'available') {
    delete payload.expiresAt;
  }

  ioInstance.emit('seatUpdate', payload);
}

function bindHoldEvents(): void {
  holdEvents.on('hold.created', (hold) => {
    emitSeatUpdate(hold, 'held', 'hold.created');
  });
  holdEvents.on('hold.extended', (hold) => {
    emitSeatUpdate(hold, 'held', 'hold.extended');
  });
  holdEvents.on('hold.released', (hold) => {
    emitSeatUpdate(hold, 'available', 'hold.released');
  });
  holdEvents.on('hold.expired', (hold) => {
    emitSeatUpdate(hold, 'available', 'hold.expired');
  });
}

let eventsBound = false;

export function attachDiningRealtime(server: HTTPServer): SocketIOServer {
  if (ioInstance) {
    return ioInstance;
  }

  const io = new SocketIOServer(server, {
    path: '/ws/dining',
    cors: {
      origin: process.env.SOCKET_ORIGIN ?? '*',
      credentials: true,
    },
  });

  io.on('connection', (socket: Socket) => {
    socket.emit('welcome', { message: 'connected' });
  });

  ioInstance = io;

  if (!eventsBound) {
    bindHoldEvents();
    eventsBound = true;
  }

  return io;
}

export function getDiningSocket(): SocketIOServer | null {
  return ioInstance;
}

