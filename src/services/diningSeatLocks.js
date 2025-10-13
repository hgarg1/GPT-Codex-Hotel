const crypto = require('crypto');
const EventEmitter = require('events');
const { getRedis } = require('../db/redis');
const { listSeats } = require('./diningService');

const seatEmitter = new EventEmitter();
const localLocks = new Map();

async function ensureRedisConnected(client) {
  if (!client || typeof client.connect !== 'function') {
    return false;
  }
  if (client.status === 'ready' || client.status === 'connecting') {
    return true;
  }
  try {
    await client.connect();
    return true;
  } catch (error) {
    console.warn('Redis connection failed, continuing with in-memory locks.', error.message);
    return false;
  }
}

function emitSnapshot() {
  const seats = listSeats();
  seatEmitter.emit('snapshot', seats);
}

function getCurrentSeats() {
  return listSeats().map((seat) => {
    const override = localLocks.get(seat.id);
    if (override?.expiresAt > Date.now()) {
      return { ...seat, status: override.status };
    }
    return seat;
  });
}

async function lockSeat(seatId, userId, ttlSeconds = 300) {
  const redis = getRedis();
  const lockId = crypto.randomUUID();
  const expiresAt = Date.now() + ttlSeconds * 1000;

  const applyLock = () => {
    localLocks.set(seatId, { userId, lockId, status: 'held', expiresAt });
    seatEmitter.emit('update', { seatId, status: 'held', userId, lockId, expiresAt });
    return { ok: true, lockId, expiresAt };
  };

  const redisReady = await ensureRedisConnected(redis);
  if (redisReady && typeof redis.set === 'function') {
    const response = await redis.set(`dining:seat:${seatId}`, lockId, 'EX', ttlSeconds, 'NX');
    if (response === 'OK') {
      return applyLock();
    }
    return { ok: false, error: 'Seat already held.' };
  }

  const existing = localLocks.get(seatId);
  if (existing && existing.expiresAt > Date.now()) {
    return { ok: false, error: 'Seat already held.' };
  }
  return applyLock();
}

async function releaseSeat(seatId, lockId) {
  const redis = getRedis();
  const redisReady = await ensureRedisConnected(redis);

  if (redisReady && typeof redis.get === 'function') {
    const value = await redis.get(`dining:seat:${seatId}`);
    if (value === lockId) {
      await redis.del(`dining:seat:${seatId}`);
    }
  }

  const record = localLocks.get(seatId);
  if (record && record.lockId === lockId) {
    localLocks.delete(seatId);
    seatEmitter.emit('update', { seatId, status: 'available' });
    return { ok: true };
  }
  return { ok: false };
}

function markReserved(seatIds) {
  const ids = Array.isArray(seatIds) ? seatIds : [seatIds];
  ids.forEach((seatId) => {
    const record = localLocks.get(seatId);
    if (record) {
      localLocks.delete(seatId);
    }
    seatEmitter.emit('update', { seatId, status: 'reserved' });
  });
}

module.exports = {
  seatEmitter,
  getCurrentSeats,
  lockSeat,
  releaseSeat,
  markReserved,
  emitSnapshot
};
