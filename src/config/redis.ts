import Redis from 'ioredis';

const getRequiredRedisUrl = (): string => {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    throw new Error(
      '[Redis] Missing REDIS_URL environment variable. Set REDIS_URL in your .env file.'
    );
  }
  return redisUrl;
};

const attachClientListeners = (client: Redis, label: string): void => {
  client.on('connect', () => {
    console.info(`[Redis:${label}] TCP connection established`);
  });

  client.on('ready', () => {
    console.info(`[Redis:${label}] Client ready`);
  });

  client.on('reconnecting', (delayMs: number) => {
    console.warn(`[Redis:${label}] Reconnecting in ${delayMs}ms...`);
  });

  // Prevents unhandled 'error' events from crashing Node.js during network blips
  client.on('error', (err: Error) => {
    console.error(`[Redis:${label}] Connection error:`, err.message);
  });
};

const createPrimaryRedisClient = (): Redis => {
  const redisUrl = getRequiredRedisUrl();
  const isTlsEnabled =
    process.env.REDIS_TLS === 'true' || redisUrl.startsWith('rediss://');

  // Inline options literal satisfies `exactOptionalPropertyTypes: true` in ioredis v6
  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
    keepAlive: 10_000,
    connectTimeout: 10_000,
    retryStrategy: (times: number): number => Math.min(times * 200, 5_000),
    ...(isTlsEnabled ? { tls: { rejectUnauthorized: false } } : {}),
  });

  attachClientListeners(client, 'primary');
  return client;
};

// Shared client for rate limiting, presence tracking, and caching
export const redisClient: Redis = createPrimaryRedisClient();

/**
 * Creates an isolated duplicate connection with error listeners pre-attached.
 * Used by @socket.io/redis-adapter (dedicated pubClient & subClient) in Step 3.
 */
export const createRedisDuplicate = (label: string): Redis => {
  const duplicate = redisClient.duplicate();
  attachClientListeners(duplicate, label);
  return duplicate;
};

/**
 * Verifies Redis connectivity during server startup.
 */
export const verifyRedisConnection = async (): Promise<boolean> => {
  try {
    const pong = await redisClient.ping();
    return pong === 'PONG';
  } catch (err) {
    console.error('[Redis:primary] Health ping failed:', (err as Error).message);
    return false;
  }
};

/**
 * Graceful shutdown hook for SIGTERM / SIGINT handlers.
 */
export const disconnectRedis = async (): Promise<void> => {
  if (redisClient.status !== 'end') {
    await redisClient.quit();
  }
};