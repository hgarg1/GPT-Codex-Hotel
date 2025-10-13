const Redis = require('ioredis');

let redisClient;

const memoryKeyValue = new Map();
const memoryExpiry = new Map();
const memorySets = new Map();

function isExpired(key) {
  const expiresAt = memoryExpiry.get(key);
  if (typeof expiresAt === 'number' && expiresAt <= Date.now()) {
    memoryExpiry.delete(key);
    memoryKeyValue.delete(key);
    memorySets.delete(key);
    return true;
  }
  return false;
}

function setExpiry(key, seconds) {
  if (typeof seconds !== 'number' || Number.isNaN(seconds) || seconds <= 0) {
    memoryExpiry.delete(key);
    return;
  }
  memoryExpiry.set(key, Date.now() + seconds * 1000);
}

async function memorySet(key, value, ...options) {
  let condition = null;
  let ttlSeconds;
  for (let i = 0; i < options.length; i += 1) {
    const option = options[i];
    if (option === 'NX' || option === 'XX') {
      condition = option;
    } else if (option === 'EX') {
      ttlSeconds = Number(options[i + 1]);
      i += 1;
    }
  }

  if (condition === 'NX' && memoryKeyValue.has(key) && !isExpired(key)) {
    return null;
  }

  memoryKeyValue.set(key, value);
  if (typeof ttlSeconds === 'number' && Number.isFinite(ttlSeconds)) {
    setExpiry(key, ttlSeconds);
  } else {
    memoryExpiry.delete(key);
  }
  return 'OK';
}

async function memoryGet(key) {
  if (isExpired(key)) {
    return null;
  }
  return memoryKeyValue.has(key) ? memoryKeyValue.get(key) : null;
}

async function memoryDel(key) {
  const existed = memoryKeyValue.delete(key) || memorySets.delete(key);
  memoryExpiry.delete(key);
  return existed ? 1 : 0;
}

async function memorySAdd(key, member) {
  if (isExpired(key)) {
    memorySets.delete(key);
  }
  const set = memorySets.get(key) || new Set();
  set.add(member);
  memorySets.set(key, set);
  return 1;
}

async function memorySRem(key, member) {
  if (isExpired(key)) {
    memorySets.delete(key);
    return 0;
  }
  const set = memorySets.get(key);
  if (!set) {
    return 0;
  }
  const existed = set.delete(member);
  if (set.size === 0) {
    memorySets.delete(key);
  }
  return existed ? 1 : 0;
}

async function memorySMembers(key) {
  if (isExpired(key)) {
    return [];
  }
  const set = memorySets.get(key);
  if (!set) {
    return [];
  }
  return Array.from(set);
}

async function memoryExpire(key, seconds) {
  setExpiry(key, seconds);
  return 1;
}

async function memoryMGet(keys) {
  return Promise.all(keys.map((key) => memoryGet(key)));
}

function createMemoryMulti() {
  const commands = [];
  return {
    set(key, value, ...opts) {
      commands.push(() => memorySet(key, value, ...opts));
      return this;
    },
    del(...keys) {
      commands.push(() => Promise.all(keys.map((key) => memoryDel(key))));
      return this;
    },
    sadd(key, member) {
      commands.push(() => memorySAdd(key, member));
      return this;
    },
    srem(key, member) {
      commands.push(() => memorySRem(key, member));
      return this;
    },
    expire(key, seconds) {
      commands.push(() => memoryExpire(key, seconds));
      return this;
    },
    async exec() {
      await Promise.all(commands.map((fn) => fn()));
      return [];
    }
  };
}

function getRedis() {
  if (redisClient) {
    return redisClient;
  }

  const { REDIS_URL, REDIS_HOST, REDIS_PORT, REDIS_PASSWORD } = process.env;

  try {
    if (REDIS_URL) {
      redisClient = new Redis(REDIS_URL, { lazyConnect: true });
      return redisClient;
    }

    if (REDIS_HOST) {
      redisClient = new Redis({
        host: REDIS_HOST,
        port: REDIS_PORT ? Number(REDIS_PORT) : 6379,
        password: REDIS_PASSWORD,
        lazyConnect: true
      });
      return redisClient;
    }
  } catch (error) {
    console.warn('Failed to initialize Redis client', error);
  }

  redisClient = {
    status: 'ready',
    async connect() {
      return Promise.resolve();
    },
    async quit() {
      return Promise.resolve();
    },
    async set(key, value, ...options) {
      return memorySet(key, value, ...options);
    },
    async get(key) {
      return memoryGet(key);
    },
    async del(key) {
      return memoryDel(key);
    },
    async sadd(key, member) {
      return memorySAdd(key, member);
    },
    async srem(key, member) {
      return memorySRem(key, member);
    },
    async smembers(key) {
      return memorySMembers(key);
    },
    async expire(key, seconds) {
      return memoryExpire(key, seconds);
    },
    async mget(keys) {
      return memoryMGet(keys);
    },
    multi() {
      return createMemoryMulti();
    }
  };

  return redisClient;
}

module.exports = { getRedis };
