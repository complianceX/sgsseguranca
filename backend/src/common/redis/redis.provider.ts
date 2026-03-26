import 'dotenv/config';
import Redis from 'ioredis';
import { Logger, Provider } from '@nestjs/common';
import {
  isRedisExplicitlyDisabled,
  resolveRedisConnection,
} from './redis-connection.util';

export const REDIS_CLIENT = 'REDIS_CLIENT';
const logger = new Logger('RedisProvider');

function redisRetryStrategy(times: number): number {
  return Math.min(Math.max(times, 1) * 250, 2000);
}

function shouldReconnectOnRedisError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('readonly') ||
    message.includes('connection is closed') ||
    message.includes('econnreset') ||
    message.includes('etimedout') ||
    message.includes('socket closed')
  );
}

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

class InMemoryRedis {
  private store = new Map<string, string>();
  private sets = new Map<string, Set<string>>();
  private expiresAt = new Map<string, number>();

  private purgeIfExpired(key: string): void {
    const expiry = this.expiresAt.get(key);
    if (expiry && expiry <= Date.now()) {
      this.store.delete(key);
      this.expiresAt.delete(key);
    }
  }

  get(key: string): Promise<string | null> {
    this.purgeIfExpired(key);
    return Promise.resolve(this.store.has(key) ? this.store.get(key)! : null);
  }

  set(
    key: string,
    value: string,
    ...args: Array<string | number>
  ): Promise<'OK' | null> {
    this.purgeIfExpired(key);
    const normalizedArgs = args.map((item) =>
      typeof item === 'string' ? item.toUpperCase() : item,
    );
    const useNx = normalizedArgs.includes('NX');
    const exIndex = normalizedArgs.findIndex((item) => item === 'EX');
    const pxIndex = normalizedArgs.findIndex((item) => item === 'PX');

    if (useNx && this.store.has(key)) {
      return Promise.resolve(null);
    }

    this.store.set(key, value);

    if (exIndex >= 0 && typeof args[exIndex + 1] === 'number') {
      this.expiresAt.set(key, Date.now() + Number(args[exIndex + 1]) * 1000);
    } else if (pxIndex >= 0 && typeof args[pxIndex + 1] === 'number') {
      this.expiresAt.set(key, Date.now() + Number(args[pxIndex + 1]));
    } else {
      this.expiresAt.delete(key);
    }

    return Promise.resolve('OK');
  }
  setex(key: string, ttl: number, value: string): Promise<'OK'> {
    this.store.set(key, value);
    this.expiresAt.set(key, Date.now() + ttl * 1000);
    return Promise.resolve('OK');
  }
  incr(key: string): Promise<number> {
    this.purgeIfExpired(key);
    const v = Number(this.store.get(key) || '0') + 1;
    this.store.set(key, String(v));
    return Promise.resolve(v);
  }

  expire(key: string, seconds: number): Promise<number> {
    this.purgeIfExpired(key);
    if (!this.store.has(key) && !this.sets.has(key)) {
      return Promise.resolve(0);
    }

    this.expiresAt.set(key, Date.now() + seconds * 1000);
    return Promise.resolve(1);
  }
  exists(key: string): Promise<number> {
    this.purgeIfExpired(key);
    return Promise.resolve(this.store.has(key) || this.sets.has(key) ? 1 : 0);
  }
  sscan(
    key: string,
    _cursor: string,
    _cmd?: string,
    _count?: number,
  ): Promise<[string, string[]]> {
    const set = this.sets.get(key) || new Set<string>();
    const arr = Array.from(set);
    return Promise.resolve(['0', arr]);
  }
  unlink(...keys: string[]): Promise<number> {
    let n = 0;
    for (const k of keys) {
      this.expiresAt.delete(k);
      if (this.store.delete(k)) n++;
    }
    return Promise.resolve(n);
  }
  del(...keys: string[]): Promise<number> {
    let n = 0;
    for (const k of keys) {
      this.expiresAt.delete(k);
      if (this.store.delete(k)) n++;
      const s = this.sets.get(k);
      if (s) {
        this.sets.delete(k);
        n++;
      }
    }
    return Promise.resolve(n);
  }
  sadd(key: string, member: string): Promise<number> {
    let set = this.sets.get(key);
    if (!set) {
      set = new Set<string>();
      this.sets.set(key, set);
    }
    set.add(member);
    return Promise.resolve(1);
  }
  srem(key: string, member: string): Promise<number> {
    const set = this.sets.get(key);
    if (!set) return Promise.resolve(0);
    const had = set.delete(member);
    return Promise.resolve(had ? 1 : 0);
  }
  scan(
    _cursor: string,
    _matchCmd?: string,
    match?: string,
    _countCmd?: string,
    _count?: number,
  ): Promise<[string, string[]]> {
    const keys = Array.from(this.store.keys()).filter((k) => {
      this.purgeIfExpired(k);
      if (!this.store.has(k)) return false;
      if (!match) return true;
      const regex = new RegExp('^' + match.replace(/\*/g, '.*') + '$');
      return regex.test(k);
    });
    return Promise.resolve(['0', keys]);
  }
  eval(
    script: string,
    numKeys: number,
    key: string,
    ...args: string[]
  ): Promise<number | string | null> {
    this.purgeIfExpired(key);

    if (numKeys === 1 && args.length >= 1 && script.includes('DEL')) {
      if (this.store.get(key) === args[0]) {
        this.store.delete(key);
        this.expiresAt.delete(key);
        return Promise.resolve(1);
      }

      return Promise.resolve(0);
    }

    return Promise.resolve(1);
  }
  multi() {
    const ops: Array<() => Promise<unknown>> = [];
    const builder = {
      setex: (k: string, t: number, v: string) => {
        ops.push(() => this.setex(k, t, v));
        return builder;
      },
      sadd: (k: string, m: string) => {
        ops.push(() => this.sadd(k, m));
        return builder;
      },
      expire: (k: string, s: number) => {
        ops.push(() => this.expire(k, s));
        return builder;
      },
      del: (k: string) => {
        ops.push(() => this.del(k));
        return builder;
      },
      srem: (k: string, m: string) => {
        ops.push(() => this.srem(k, m));
        return builder;
      },
      exec: async () => {
        const results: unknown[] = [];
        for (const op of ops) {
          results.push(await op());
        }
        return results;
      },
    };
    return builder;
  }
  on(_event: string, _fn: (err: Error) => void) {}
}

export const redisProvider: Provider = {
  provide: REDIS_CLIENT,
  useFactory: async () => {
    const redisDisabled = isRedisExplicitlyDisabled(process.env);
    if (redisDisabled) {
      logger.warn(
        'Redis disabled (REDIS_DISABLED=true). Using in-memory fallback.',
      );
      return new InMemoryRedis() as unknown as Redis;
    }
    const redisConnection = resolveRedisConnection(process.env);
    if (!redisConnection) {
      throw new Error(
        'Redis deve ser configurado quando REDIS_DISABLED=false.',
      );
    }
    const redisUrlFrom = redisConnection.source === 'url' ? 'REDIS_URL' : null;
    const redisUrl = redisConnection.url;
    if (redisUrl) {
      assertValidRedisUrl(redisUrl);
    }

    try {
      logger.log(
        `Redis target: source=${redisUrlFrom || redisConnection.source} host=${redisConnection.host} port=${redisConnection.port} tls=${!!redisConnection.tls}`,
      );
    } catch {
      // noop
    }

    const client = redisUrl
      ? new Redis(redisUrl, {
          maxRetriesPerRequest: 1,
          enableReadyCheck: false,
          connectTimeout: 10000,
          lazyConnect: true,
          retryStrategy: redisRetryStrategy,
          reconnectOnError: (error) => shouldReconnectOnRedisError(error),
        })
      : new Redis({
          host: redisConnection.host,
          port: redisConnection.port,
          username: redisConnection.username,
          password: redisConnection.password,
          tls: redisConnection.tls,
          maxRetriesPerRequest: 1,
          enableReadyCheck: false,
          connectTimeout: 10000,
          lazyConnect: true,
          retryStrategy: redisRetryStrategy,
          reconnectOnError: (error) => shouldReconnectOnRedisError(error),
        });

    client.on('error', (err) => {
      logger.error(`Redis connection error: ${err.message}`);
    });
    client.on('close', () => {
      logger.warn('Redis connection closed. Waiting for automatic reconnect.');
    });
    client.on('reconnecting', (delay: number) => {
      logger.warn(`Redis reconnect scheduled in ${delay}ms.`);
    });
    client.on('ready', () => {
      logger.log('Redis client ready.');
    });
    client.on('end', () => {
      logger.warn('Redis connection ended.');
    });

    const failOpen = /^true$/i.test(
      process.env.REDIS_FAIL_OPEN ||
        (process.env.NODE_ENV === 'production' ? 'false' : 'true'),
    );
    try {
      await Promise.race([
        client.connect(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('Redis connect timeout during bootstrap')),
            12000,
          ),
        ),
      ]);
      logger.log('✅ Redis connected');
      return client;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`❌ Redis unavailable at bootstrap: ${message}`);
      try {
        client.disconnect();
      } catch {
        // noop
      }

      if (!failOpen) {
        throw error;
      }

      logger.warn(
        '⚠️ REDIS_FAIL_OPEN ativo: fallback para cache em memória (funcionalidades de fila/redis podem degradar).',
      );
      return new InMemoryRedis() as unknown as Redis;
    }
  },
};
