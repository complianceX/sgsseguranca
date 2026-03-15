import 'dotenv/config';
import Redis from 'ioredis';
import { Logger, Provider } from '@nestjs/common';
import {
  isRedisExplicitlyDisabled,
  resolveRedisConnection,
} from './redis-connection.util';

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

class InMemoryRedis {
  private store = new Map<string, string>();
  private sets = new Map<string, Set<string>>();
  get(key: string): Promise<string | null> {
    return Promise.resolve(this.store.has(key) ? this.store.get(key)! : null);
  }
  set(key: string, value: string): Promise<'OK'> {
    this.store.set(key, value);
    return Promise.resolve('OK');
  }
  setex(key: string, _ttl: number, value: string): Promise<'OK'> {
    this.store.set(key, value);
    return Promise.resolve('OK');
  }
  incr(key: string): Promise<number> {
    const v = Number(this.store.get(key) || '0') + 1;
    this.store.set(key, String(v));
    return Promise.resolve(v);
  }
  expire(_key: string, _seconds: number): Promise<number> {
    return Promise.resolve(1);
  }
  exists(key: string): Promise<number> {
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
      if (this.store.delete(k)) n++;
    }
    return Promise.resolve(n);
  }
  del(...keys: string[]): Promise<number> {
    let n = 0;
    for (const k of keys) {
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
      if (!match) return true;
      const regex = new RegExp('^' + match.replace(/\*/g, '.*') + '$');
      return regex.test(k);
    });
    return Promise.resolve(['0', keys]);
  }
  eval(
    _script: string,
    _numKeys: number,
    _key: string,
    ..._args: string[]
  ): Promise<number> {
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
          retryStrategy: () => null,
          reconnectOnError: () => false,
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
          retryStrategy: () => null,
          reconnectOnError: () => false,
        });

    client.on('error', (err) => {
      logger.error(`Redis connection error: ${err.message}`);
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
