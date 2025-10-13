import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import type Redis from 'ioredis';
import { getRedis } from '../db/redis.js';

export interface HoldRecord {
  holdId: string;
  userId: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  tableIds: string[];
  expiresAt: number; // epoch ms
}

const HOLD_TTL_SECONDS = Number(process.env.DINING_HOLD_TTL ?? 180);

type HoldKey = string;

const localHolds = new Map<HoldKey, HoldRecord>();
const holdIdToKey = new Map<string, HoldKey>();
const expiryTimers = new Map<string, NodeJS.Timeout>();

type HoldEventMap = {
  'hold.created': (hold: HoldRecord) => void;
  'hold.released': (hold: HoldRecord) => void;
  'hold.extended': (hold: HoldRecord) => void;
  'hold.expired': (hold: HoldRecord) => void;
};

export const holdEvents = new EventEmitter<HoldEventMap>();

function buildHoldKey(date: string, time: string, tableIds: string[]): HoldKey {
  const normalizedIds = [...tableIds].sort();
  return `hold:${date}:${time}:${normalizedIds.join(',')}`;
}

function buildIndexKey(date: string, time: string): string {
  return `hold:index:${date}:${time}`;
}

function buildLookupKey(holdId: string): string {
  return `holdById:${holdId}`;
}

async function ensureRedisConnected(client: Redis | undefined | null): Promise<boolean> {
  if (!client || typeof client.connect !== 'function') {
    return false;
  }
  if ((client as any).status === 'ready' || (client as any).status === 'connecting') {
    return true;
  }
  try {
    await client.connect();
    return true;
  } catch (error) {
    console.warn('Redis connection failed for dining holds. Falling back to memory.', (error as Error).message);
    return false;
  }
}

function purgeExpiredLocalHolds(): void {
  const now = Date.now();
  for (const [key, hold] of localHolds.entries()) {
    if (hold.expiresAt <= now) {
      localHolds.delete(key);
      holdIdToKey.delete(hold.holdId);
    }
  }
}

async function storeHoldInRedis(
  redis: Redis,
  hold: HoldRecord,
  ttlSeconds: number,
  holdKey: HoldKey,
): Promise<boolean> {
  const indexKey = buildIndexKey(hold.date, hold.time);
  const lookupKey = buildLookupKey(hold.holdId);
  const payload = JSON.stringify(hold);

  const setResult = await redis.set(holdKey, payload, 'EX', ttlSeconds, 'NX');
  if (setResult !== 'OK') {
    return false;
  }

  await redis.multi()
    .set(lookupKey, holdKey, 'EX', ttlSeconds)
    .sadd(indexKey, holdKey)
    .expire(indexKey, Math.max(ttlSeconds, HOLD_TTL_SECONDS))
    .exec();

  return true;
}

function storeHoldLocally(hold: HoldRecord, holdKey: HoldKey): void {
  purgeExpiredLocalHolds();
  localHolds.set(holdKey, hold);
  holdIdToKey.set(hold.holdId, holdKey);
}

function clearExpiryTimer(holdId: string): void {
  const timer = expiryTimers.get(holdId);
  if (timer) {
    clearTimeout(timer);
    expiryTimers.delete(holdId);
  }
}

function scheduleExpiry(hold: HoldRecord): void {
  clearExpiryTimer(hold.holdId);
  const delay = hold.expiresAt - Date.now();
  if (delay <= 0) {
    holdEvents.emit('hold.expired', hold);
    return;
  }
  const timer = setTimeout(() => {
    expiryTimers.delete(hold.holdId);
    const holdKey = holdIdToKey.get(hold.holdId);
    if (holdKey) {
      localHolds.delete(holdKey);
      holdIdToKey.delete(hold.holdId);
    }
    holdEvents.emit('hold.expired', hold);
  }, delay);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }
  expiryTimers.set(hold.holdId, timer);
}

export async function createHold(
  params: {
    date: string;
    time: string;
    tableIds: string[];
    userId: string;
    ttlSeconds?: number;
  },
): Promise<{ hold: HoldRecord } | { error: string }> {
  const { date, time, tableIds, userId } = params;
  const ttlSeconds = params.ttlSeconds ?? HOLD_TTL_SECONDS;

  if (!date || !time || !Array.isArray(tableIds) || tableIds.length === 0) {
    return { error: 'Invalid hold parameters' };
  }

  const holdKey = buildHoldKey(date, time, tableIds);
  const redis = getRedis() as Redis | undefined;
  const redisReady = await ensureRedisConnected(redis);

  const now = Date.now();
  const existingHold = redisReady
    ? await redis!.get(holdKey)
    : undefined;
  if (existingHold) {
    return { error: 'Tables already held' };
  }

  purgeExpiredLocalHolds();
  const localExisting = localHolds.get(holdKey);
  if (localExisting && localExisting.expiresAt > now) {
    return { error: 'Tables already held' };
  }

  const hold: HoldRecord = {
    holdId: crypto.randomUUID(),
    userId,
    date,
    time,
    tableIds: [...tableIds].sort(),
    expiresAt: now + ttlSeconds * 1000,
  };

  if (redisReady && redis) {
    const stored = await storeHoldInRedis(redis, hold, ttlSeconds, holdKey);
    if (!stored) {
      console.warn('Failed to persist hold to Redis, using in-memory store.');
    } else {
      storeHoldLocally(hold, holdKey);
      scheduleExpiry(hold);
      holdEvents.emit('hold.created', hold);
      return { hold };
    }
  }

  storeHoldLocally(hold, holdKey);
  scheduleExpiry(hold);
  holdEvents.emit('hold.created', hold);
  return { hold };
}

export async function releaseHold(holdId: string): Promise<boolean> {
  purgeExpiredLocalHolds();
  const localKey = holdIdToKey.get(holdId);
  const existing = localKey ? localHolds.get(localKey) : undefined;
  if (localKey) {
    localHolds.delete(localKey);
    holdIdToKey.delete(holdId);
  }
  if (existing) {
    clearExpiryTimer(existing.holdId);
  }

  const redis = getRedis() as Redis | undefined;
  const redisReady = await ensureRedisConnected(redis);
  let holdForEvent = existing;
  let released = Boolean(localKey);
  if (redisReady && redis) {
    const lookupKey = buildLookupKey(holdId);
    const holdKey = await redis.get(lookupKey);
    if (holdKey) {
      const parsed = localHolds.get(holdKey);
      if (parsed) {
        localHolds.delete(holdKey);
        holdIdToKey.delete(parsed.holdId);
        clearExpiryTimer(parsed.holdId);
      }

      let payload: string | null = null;
      const parts = holdKey.split(':');
      if (parts.length >= 4) {
        const date = parts[1];
        const time = parts[2];
        const indexKey = buildIndexKey(date, time);
        payload = await redis.get(holdKey);
        await redis.multi().del(holdKey, lookupKey).srem(indexKey, holdKey).exec();
        released = true;
      } else {
        payload = await redis.get(holdKey);
        await redis.del(holdKey);
        await redis.del(lookupKey);
        released = true;
      }

      if (payload) {
        try {
          holdForEvent = JSON.parse(payload) as HoldRecord;
        } catch (error) {
          console.warn('Failed to parse hold payload during release', error);
        }
      }
    }
  }
  if (holdForEvent) {
    holdEvents.emit('hold.released', holdForEvent);
  }
  return released;
}

export async function extendHold(holdId: string, ttlSeconds?: number): Promise<HoldRecord | undefined> {
  purgeExpiredLocalHolds();
  const ttl = ttlSeconds ?? HOLD_TTL_SECONDS;
  const redis = getRedis() as Redis | undefined;
  const redisReady = await ensureRedisConnected(redis);

  const now = Date.now();
  const localKey = holdIdToKey.get(holdId);
  let updated: HoldRecord | undefined;
  if (localKey) {
    const record = localHolds.get(localKey);
    if (record) {
      record.expiresAt = now + ttl * 1000;
      localHolds.set(localKey, record);
      updated = record;
      scheduleExpiry(record);
    }
  }

  if (redisReady && redis) {
    const lookupKey = buildLookupKey(holdId);
    const holdKey = await redis.get(lookupKey);
    if (!holdKey) {
      return updated;
    }
    const holdRaw = await redis.get(holdKey);
    if (!holdRaw) {
      return updated;
    }
    const hold = JSON.parse(holdRaw) as HoldRecord;
    hold.expiresAt = now + ttl * 1000;
    await storeHoldInRedis(redis, hold, ttl, holdKey);
    storeHoldLocally(hold, holdKey);
    scheduleExpiry(hold);
    holdEvents.emit('hold.extended', hold);
    return hold;
  }

  if (updated) {
    holdEvents.emit('hold.extended', updated);
  }
  return updated;
}

export async function listHoldsForSlot(date: string, time: string): Promise<HoldRecord[]> {
  purgeExpiredLocalHolds();
  const redis = getRedis() as Redis | undefined;
  const redisReady = await ensureRedisConnected(redis);

  const holds: HoldRecord[] = [];

  if (redisReady && redis) {
    const indexKey = buildIndexKey(date, time);
    const holdKeys = await redis.smembers(indexKey);
    if (holdKeys.length > 0) {
      const pipeline = (redis as unknown as Redis & { mget: Redis['mget'] });
      const values = await pipeline.mget(holdKeys);
      for (let i = 0; i < holdKeys.length; i += 1) {
        const value = values[i];
        if (!value) {
          continue;
        }
        try {
          const record = JSON.parse(value) as HoldRecord;
          if (record.expiresAt > Date.now()) {
            holds.push(record);
            storeHoldLocally(record, holdKeys[i]);
            scheduleExpiry(record);
          }
        } catch (error) {
          console.warn('Failed to parse hold payload', error);
        }
      }
    }
  }

  for (const [key, hold] of localHolds.entries()) {
    if (hold.date === date && hold.time === time && hold.expiresAt > Date.now()) {
      if (!holds.some((existing) => existing.holdId === hold.holdId)) {
        holds.push(hold);
        storeHoldLocally(hold, key);
        scheduleExpiry(hold);
      }
    }
  }

  return holds;
}

export function getHoldLocally(holdId: string): HoldRecord | undefined {
  purgeExpiredLocalHolds();
  const key = holdIdToKey.get(holdId);
  if (!key) {
    return undefined;
  }
  return localHolds.get(key);
}

export async function getHoldById(holdId: string): Promise<HoldRecord | undefined> {
  const local = getHoldLocally(holdId);
  if (local) {
    return local;
  }

  const redis = getRedis() as Redis | undefined;
  const redisReady = await ensureRedisConnected(redis);
  if (!redisReady || !redis) {
    return undefined;
  }

  const lookupKey = buildLookupKey(holdId);
  const holdKey = await redis.get(lookupKey);
  if (!holdKey) {
    return undefined;
  }
  const payload = await redis.get(holdKey);
  if (!payload) {
    return undefined;
  }
  try {
    const record = JSON.parse(payload) as HoldRecord;
    storeHoldLocally(record, holdKey);
    scheduleExpiry(record);
    return record;
  } catch (error) {
    console.warn('Failed to parse hold payload for lookup', error);
    return undefined;
  }
}

