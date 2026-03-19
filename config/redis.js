const { createClient } = require('redis');
const dotenv = require('dotenv');

dotenv.config();

const REDIS_HOST = process.env.REDIS_HOST?.trim();
const REDIS_USE_TLS = process.env.REDIS_USE_TLS !== 'false';
const REDIS_ENABLED = !!REDIS_HOST;

// No-op client when Redis is disabled (avoids connection errors)
const createNoopClient = () => {
  const noop = () => {};
  const noopAsync = async () => null;
  const noopAsyncBool = async () => false;
  const noopAsyncNum = async () => 0;
  return {
    connect: noopAsync,
    get: noopAsync,
    set: noopAsync,
    del: noopAsync,
    exists: noopAsync,
    ping: async () => { throw new Error('Redis disabled'); },
    FLUSHDB: noopAsync,
    isReady: false,
    scanIterator: async function* () { return; },
  };
};

let redisClient;

if (REDIS_ENABLED) {
  const protocol = REDIS_USE_TLS ? 'rediss' : 'redis';
  const url = `${protocol}://${REDIS_HOST}`;
  redisClient = createClient({
    url,
    password: process.env.REDIS_PASSWORD || undefined,
    socket: {
      connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT, 10) || 15000,
      reconnectStrategy: (retries) => {
        if (retries > 5) return false;
        return Math.min(retries * 500, 5000);
      },
      ...(REDIS_USE_TLS && { tls: true }),
    },
  });

  redisClient.on('error', (err) => {
    console.error('Redis Client Error:', err);
  });
} else {
  redisClient = createNoopClient();
  console.log('REDIS: Disabled (REDIS_HOST not set)');
}

const connectRedis = async () => {
  if (!REDIS_ENABLED) return;

  try {
    await redisClient.connect();
    console.log('REDIS: Successfully connected to Redis');
  } catch (error) {
    console.error('REDIS: Failed to connect to Redis:', error?.message || error);
    console.warn('REDIS: App will run without cache. Check REDIS_HOST, network, and firewall.');
  }
};

module.exports = {
  redisClient,
  connectRedis,
  REDIS_ENABLED,
}; 