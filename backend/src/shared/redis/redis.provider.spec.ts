import {
  buildRedisConnectionCacheKey,
  readRedisMaxmemoryPolicy,
} from './redis.provider';

describe('redis.provider', () => {
  const originalRedisConnectionCacheKeySecret =
    process.env.REDIS_CONNECTION_CACHE_KEY_SECRET;

  afterEach(() => {
    if (originalRedisConnectionCacheKeySecret === undefined) {
      delete process.env.REDIS_CONNECTION_CACHE_KEY_SECRET;
    } else {
      process.env.REDIS_CONNECTION_CACHE_KEY_SECRET =
        originalRedisConnectionCacheKeySecret;
    }
  });

  it('distingue conexões URL com e sem TLS', () => {
    const base = {
      source: 'url' as const,
      url: 'redis://default:secret@redis.example.com:6379',
      host: 'redis.example.com',
      port: 6379,
    };

    const plaintext = buildRedisConnectionCacheKey(base);
    const tls = buildRedisConnectionCacheKey({
      ...base,
      tls: { rejectUnauthorized: true },
    });

    expect(plaintext).not.toBe(tls);
    expect(plaintext).toContain('tls:0');
    expect(tls).toContain('tls:1');
    expect(plaintext).not.toContain('secret');
  });

  it('não incorpora a credencial no identificador de conexão', () => {
    process.env.REDIS_CONNECTION_CACHE_KEY_SECRET = 'test-cache-key-secret';
    const first = buildRedisConnectionCacheKey({
      source: 'url',
      url: 'rediss://redis.example.com:6380',
      host: 'redis.example.com',
      port: 6380,
      password: 'secret-a',
      tls: { rejectUnauthorized: true },
    });
    const second = buildRedisConnectionCacheKey({
      source: 'url',
      url: 'rediss://redis.example.com:6380',
      host: 'redis.example.com',
      port: 6380,
      password: 'secret-b',
      tls: { rejectUnauthorized: true },
    });

    expect(first).not.toBe(second);
    expect(first).not.toContain('secret-a');
    expect(second).not.toContain('secret-b');
    expect(first).toContain('password-hmac:');
    expect(second).toContain('password-hmac:');
  });

  it('extrai maxmemory_policy do INFO Redis', () => {
    expect(
      readRedisMaxmemoryPolicy(
        '# Memory\r\nused_memory:1024\r\nmaxmemory_policy:noeviction\r\n',
      ),
    ).toBe('noeviction');
  });
});
