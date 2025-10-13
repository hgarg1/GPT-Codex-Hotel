const Redis = require('ioredis');

let redisClient;

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
    async connect() {
      return Promise.resolve();
    },
    async quit() {
      return Promise.resolve();
    },
    async set() {
      return null;
    },
    async get() {
      return null;
    },
    async del() {
      return 0;
    }
  };

  return redisClient;
}

module.exports = { getRedis };
