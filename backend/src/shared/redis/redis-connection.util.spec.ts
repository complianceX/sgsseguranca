import {
  isRedisExplicitlyDisabled,
  isLocalRedisConnection,
  isLoopbackHostname,
  resolveRedisConnection,
} from './redis-connection.util';

describe('redis-connection.util', () => {
  it('resolve tier AUTH a partir de REDIS_AUTH_URL', () => {
    const connection = resolveRedisConnection(
      {
        REDIS_AUTH_URL: 'rediss://auth-user:auth-secret@auth.redis.local:6381',
      } as NodeJS.ProcessEnv,
      'auth',
    );

    expect(connection).toEqual({
      source: 'url',
      url: 'rediss://auth-user:auth-secret@auth.redis.local:6381',
      host: 'auth.redis.local',
      port: 6381,
      username: 'auth-user',
      password: 'auth-secret',
      tls: { rejectUnauthorized: true },
    });
  });

  it('resolve tier CACHE a partir de REDIS_CACHE_URL', () => {
    const connection = resolveRedisConnection(
      {
        REDIS_CACHE_URL:
          'redis://cache-user:cache-secret@cache.redis.local:6380',
      } as NodeJS.ProcessEnv,
      'cache',
    );

    expect(connection).toEqual({
      source: 'url',
      url: 'redis://cache-user:cache-secret@cache.redis.local:6380',
      host: 'cache.redis.local',
      port: 6380,
      username: 'cache-user',
      password: 'cache-secret',
      tls: undefined,
    });
  });

  it('resolve tier QUEUE a partir de REDIS_QUEUE_HOST/PORT', () => {
    const connection = resolveRedisConnection(
      {
        REDIS_QUEUE_HOST: 'queue.redis.local',
        REDIS_QUEUE_PORT: '6390',
        REDIS_QUEUE_PASSWORD: 'queue-secret',
      } as NodeJS.ProcessEnv,
      'queue',
    );

    expect(connection).toEqual({
      source: 'host',
      host: 'queue.redis.local',
      port: 6390,
      username: undefined,
      password: 'queue-secret',
      tls: undefined,
    });
  });

  it('resolve conexão a partir de REDIS_URL', () => {
    const connection = resolveRedisConnection({
      REDIS_URL: 'rediss://default:secret@example.upstash.io:6380',
    } as NodeJS.ProcessEnv);

    expect(connection).toEqual({
      source: 'url',
      url: 'rediss://default:secret@example.upstash.io:6380',
      host: 'example.upstash.io',
      port: 6380,
      username: 'default',
      password: 'secret',
      tls: { rejectUnauthorized: true },
    });
  });

  it('mantém validação TLS mesmo quando modo inseguro é solicitado', () => {
    const connection = resolveRedisConnection({
      REDIS_URL: 'rediss://default:secret@example.upstash.io:6380',
      REDIS_TLS_ALLOW_INSECURE: 'true',
    } as NodeJS.ProcessEnv);

    expect(connection).toEqual({
      source: 'url',
      url: 'rediss://default:secret@example.upstash.io:6380',
      host: 'example.upstash.io',
      port: 6380,
      username: 'default',
      password: 'secret',
      tls: { rejectUnauthorized: true },
    });
  });

  it('resolve conexão a partir de REDIS_HOST/PORT', () => {
    const connection = resolveRedisConnection({
      REDIS_HOST: 'redis.internal',
      REDIS_PORT: '6379',
      REDIS_PASSWORD: 'pw',
    } as NodeJS.ProcessEnv);

    expect(connection).toEqual({
      source: 'host',
      host: 'redis.internal',
      port: 6379,
      password: 'pw',
      tls: undefined,
    });
  });

  it('retorna null quando REDIS_DISABLED=true', () => {
    expect(
      resolveRedisConnection({
        REDIS_DISABLED: 'true',
        REDIS_URL: 'rediss://default:secret@example.upstash.io:6380',
      } as NodeJS.ProcessEnv),
    ).toBeNull();
    expect(
      isRedisExplicitlyDisabled({
        REDIS_DISABLED: 'true',
      } as NodeJS.ProcessEnv),
    ).toBe(true);
  });

  it('usa fallback genérico quando tier específico não existe', () => {
    const connection = resolveRedisConnection(
      {
        REDIS_URL: 'redis://default:secret@generic.redis.local:6379',
      } as NodeJS.ProcessEnv,
      'auth',
    );

    expect(connection).toEqual({
      source: 'url',
      url: 'redis://default:secret@generic.redis.local:6379',
      host: 'generic.redis.local',
      port: 6379,
      username: 'default',
      password: 'secret',
      tls: undefined,
    });
  });

  it('reconhece host loopback como redis local', () => {
    expect(isLoopbackHostname('localhost')).toBe(true);
    expect(isLoopbackHostname('127.0.0.1')).toBe(true);
    expect(isLoopbackHostname('::1')).toBe(true);
    expect(isLoopbackHostname('redis.internal')).toBe(false);
    expect(isLocalRedisConnection({ host: 'localhost' } as never)).toBe(true);
  });
});
