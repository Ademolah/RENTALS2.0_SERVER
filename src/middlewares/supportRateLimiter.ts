import { Request } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { RedisReply, RedisStore } from 'rate-limit-redis';
import { redisClient } from '../config/redis';

const getActorKey = (req: Request): string => {
  const user = (req as Request & { user?: { id?: string; _id?: string; userId?: string } }).user;
  const userId = user?.userId || user?.id || user?._id?.toString();
  if (userId) {
    return `user:${userId}`;
  }
  return `ip:${ipKeyGenerator(req.ip || '0.0.0.0')}`;
};

const createRedisStore = (prefix: string): RedisStore =>
  new RedisStore({
    prefix,
    sendCommand: (command: string, ...args: string[]) =>
      redisClient.call(command, ...args) as Promise<RedisReply>,
  });

const isRedisReady = (): boolean => redisClient.status === 'ready';

// Max 6 new tickets per 15 minutes per authenticated user
export const createTicketRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 6,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  passOnStoreError: true,
  keyGenerator: getActorKey,
  skip: () => !isRedisReady(),
  store: createRedisStore('rl:support:ticket:'),
  message: {
    success: false,
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'You have opened too many support tickets recently. Please wait a few minutes.',
  },
});

// Max 45 live chat messages per minute per authenticated user
export const sendMessageRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 45,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  passOnStoreError: true,
  keyGenerator: getActorKey,
  skip: () => !isRedisReady(),
  store: createRedisStore('rl:support:msg:'),
  message: {
    success: false,
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'You are sending messages too quickly. Please slow down.',
  },
});