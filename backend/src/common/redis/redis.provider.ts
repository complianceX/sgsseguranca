import Redis from 'ioredis';
import { Logger, Provider } from '@nestjs/common';

export const REDIS_CLIENT = 'REDIS_CLIENT';
const logger = new Logger('RedisProvider');

function assertValidRedisUrl(redisUrl: string): void {
  if (redisUrl.includes('${{')) {
    throw new Error(
      'REDIS URL contains unresolved template syntax. Save the expanded value in Railway variables.',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(redisUrl);
  } catch {
    throw new Error('REDIS URL is invalid.');
  }

  if (!parsed.hostname) {
    throw new Error('REDIS URL must contain a valid hostname.');
  }

  const hostname = parsed.hostname.toLowerCase();
  const blockedHostnames = new Set([
    'host',
    'hostname',
    'abc',
    'base',
    'example',
  ]);
  if (blockedHostnames.has(hostname)) {
    throw new Error(
      `REDIS URL hostname "${parsed.hostname}" looks like a placeholder and is not valid.`,
    );
  }

  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && (hostname === 'localhost' || hostname === '127.0.0.1')) {
    throw new Error('Do not use localhost Redis URL in production.');
  }
}

export const redisProvider: Provider = {
  provide: REDIS_CLIENT,
  useFactory: async () => {
    console.log('REDIS: Connecting via URL_REDIS');
    let redisUrl =
      process.env.URL_REDIS ||
      process.env.REDIS_URL ||
      process.env.REDIS_PUBLIC_URL;
    if (!redisUrl && process.env.REDIS_HOST) {
      const redisUser = process.env.REDIS_USER || 'default';
      const redisPort = process.env.REDIS_PORT || '6379';
      const auth = process.env.REDIS_PASSWORD
        ? `${encodeURIComponent(redisUser)}:${encodeURIComponent(process.env.REDIS_PASSWORD)}@`
        : '';
      redisUrl = `redis://${auth}${process.env.REDIS_HOST}:${redisPort}`;
    }

    if (!redisUrl) {
      throw new Error('REDIS_URL or URL_REDIS must be defined');
    }
    assertValidRedisUrl(redisUrl);

    const client = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      connectTimeout: 10000,
      lazyConnect: true,
      retryStrategy: (times) => {
        // Exponential backoff: 50ms, 100ms, 200ms... up to 3s
        return Math.min(times * 50, 3000);
      },
      reconnectOnError: (err) => {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          return true;
        }
        return false;
      },
    });

    client.on('error', (err) => {
      logger.error(`Redis connection error: ${err.message}`);
    });

    await client.connect();
    return client;
  },
};
