import 'dotenv/config';
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

class InMemoryRedis {
  private store = new Map<string, string>();
  private sets = new Map<string, Set<string>>();
  async get(key: string): Promise<string | null> {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  async set(key: string, value: string): Promise<'OK'> {
    this.store.set(key, value);
    return 'OK';
  }
  async setex(key: string, _ttl: number, value: string): Promise<'OK'> {
    this.store.set(key, value);
    return 'OK';
  }
  async incr(key: string): Promise<number> {
    const v = Number(this.store.get(key) || '0') + 1;
    this.store.set(key, String(v));
    return v;
  }
  async expire(_key: string, _seconds: number): Promise<number> {
    return 1;
  }
  async exists(key: string): Promise<number> {
    return this.store.has(key) || this.sets.has(key) ? 1 : 0;
  }
  async sscan(
    key: string,
    cursor: string,
    _cmd?: string,
    _count?: number,
  ): Promise<[string, string[]]> {
    const set = this.sets.get(key) || new Set<string>();
    const arr = Array.from(set);
    return ['0', arr];
  }
  async unlink(...keys: string[]): Promise<number> {
    let n = 0;
    for (const k of keys) {
      if (this.store.delete(k)) n++;
    }
    return n;
  }
  async del(...keys: string[]): Promise<number> {
    let n = 0;
    for (const k of keys) {
      if (this.store.delete(k)) n++;
      const s = this.sets.get(k);
      if (s) {
        this.sets.delete(k);
        n++;
      }
    }
    return n;
  }
  async sadd(key: string, member: string): Promise<number> {
    let set = this.sets.get(key);
    if (!set) {
      set = new Set<string>();
      this.sets.set(key, set);
    }
    set.add(member);
    return 1;
  }
  async srem(key: string, member: string): Promise<number> {
    const set = this.sets.get(key);
    if (!set) return 0;
    const had = set.delete(member);
    return had ? 1 : 0;
  }
  async scan(
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
    return ['0', keys];
  }
  async eval(
    _script: string,
    _numKeys: number,
    _key: string,
    ..._args: string[]
  ): Promise<number> {
    return 1;
  }
  multi() {
    const ops: Array<() => Promise<any>> = [];
    return {
      setex: (k: string, t: number, v: string) =>
        ops.push(() => this.setex(k, t, v)),
      sadd: (k: string, m: string) => ops.push(() => this.sadd(k, m)),
      expire: (k: string, s: number) => ops.push(() => this.expire(k, s)),
      del: (k: string) => ops.push(() => this.del(k)),
      srem: (k: string, m: string) => ops.push(() => this.srem(k, m)),
      exec: async () => {
        const results: any[] = [];
        for (const op of ops) {
          results.push(await op());
        }
        return results;
      },
    };
  }
  on(_event: string, _fn: (err: Error) => void) {}
}

export const redisProvider: Provider = {
  provide: REDIS_CLIENT,
  useFactory: async () => {
    if (process.env.REDIS_DISABLED === 'true') {
      return new InMemoryRedis() as unknown as Redis;
    }
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

    return client;
  },
};
