import {
  assertSecureRedisConnection,
  isRedisExplicitlyDisabled,
  isLocalRedisConnection,
  isLoopbackHostname,
  resolveRedisConnection,
} from './redis-connection.util';

describe('redis-connection.util', () => {
  it('resolve tier AUTH a partir de REDIS_AUTH_URL', () => {
    const connection = resolveRedisConnection(
      {
        REDIS_AUTH_URL: 'rediss://auth-user:REDACTED@auth.redis.local:6381',
      },
      'auth',
    );

    expect(connection).toEqual({
      source: 'url',
      url: 'rediss://auth-user:REDACTED@auth.redis.local:6381',
      host: 'auth.redis.local',
      port: 6381,
      username: 'auth-user',
      password: 'REDACTED',
      tls: { rejectUnauthorized: true },
    });
  });

  it('resolve tier CACHE a partir de REDIS_CACHE_URL', () => {
    const connection = resolveRedisConnection(
      {
        REDIS_CACHE_URL: 'redis://cache-user:REDACTED@cache.redis.local:6380',
      },
      'cache',
    );

    expect(connection).toEqual({
      source: 'url',
      url: 'redis://cache-user:REDACTED@cache.redis.local:6380',
      host: 'cache.redis.local',
      port: 6380,
      username: 'cache-user',
      password: 'REDACTED',
      tls: undefined,
    });
  });

  it('resolve tier QUEUE a partir de REDIS_QUEUE_HOST/PORT', () => {
    const connection = resolveRedisConnection(
      {
        REDIS_QUEUE_HOST: 'queue.redis.local',
        REDIS_QUEUE_PORT: '6390',
        REDIS_QUEUE_PASSWORD: 'queue-secret',
      },
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

  it('resolve tier RATE_LIMIT a partir de REDIS_RATE_LIMIT_URL', () => {
    const connection = resolveRedisConnection(
      {
        REDIS_RATE_LIMIT_URL:
          'rediss://rate-user:REDACTED@rate.redis.local:6382',
      },
      'rateLimit',
    );

    expect(connection).toEqual({
      source: 'url',
      url: 'rediss://rate-user:REDACTED@rate.redis.local:6382',
      host: 'rate.redis.local',
      port: 6382,
      username: 'rate-user',
      password: 'REDACTED',
      tls: { rejectUnauthorized: true },
    });
  });

  it('resolve conexão a partir de REDIS_URL', () => {
    const connection = resolveRedisConnection({
      REDIS_URL: 'rediss://default:REDACTED@example.upstash.io:6380',
    });

    expect(connection).toEqual({
      source: 'url',
      url: 'rediss://default:REDACTED@example.upstash.io:6380',
      host: 'example.upstash.io',
      port: 6380,
      username: 'default',
      password: 'REDACTED',
      tls: { rejectUnauthorized: true },
    });
  });

  it('mantém validação TLS mesmo quando modo inseguro é solicitado', () => {
    const connection = resolveRedisConnection({
      REDIS_URL: 'rediss://default:REDACTED@example.upstash.io:6380',
      REDIS_TLS_ALLOW_INSECURE: 'true',
    });

    expect(connection).toEqual({
      source: 'url',
      url: 'rediss://default:REDACTED@example.upstash.io:6380',
      host: 'example.upstash.io',
      port: 6380,
      username: 'default',
      password: 'REDACTED',
      tls: { rejectUnauthorized: true },
    });
  });

  it('resolve conexão a partir de REDIS_HOST/PORT', () => {
    const connection = resolveRedisConnection({
      REDIS_HOST: 'redis.internal',
      REDIS_PORT: '6379',
      REDIS_PASSWORD: 'pw',
    });

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
        REDIS_URL: 'rediss://default:REDACTED@example.upstash.io:6380',
      }),
    ).toBeNull();
    expect(
      isRedisExplicitlyDisabled({
        REDIS_DISABLED: 'true',
      }),
    ).toBe(true);
  });

  it('usa fallback genérico quando tier específico não existe', () => {
    const connection = resolveRedisConnection(
      {
        REDIS_URL: 'redis://default:REDACTED@generic.redis.local:6379',
      },
      'auth',
    );

    expect(connection).toEqual({
      source: 'url',
      url: 'redis://default:REDACTED@generic.redis.local:6379',
      host: 'generic.redis.local',
      port: 6379,
      username: 'default',
      password: 'REDACTED',
      tls: undefined,
    });
  });

  it('aplica credenciais por variável quando a URL do tier não as contém', () => {
    const connection = resolveRedisConnection(
      {
        REDIS_AUTH_URL: 'rediss://auth.redis.local:6381',
        REDIS_AUTH_USERNAME: 'auth-user',
        REDIS_AUTH_PASSWORD: 'auth-secret',
      },
      'auth',
    );

    expect(connection).toEqual({
      source: 'url',
      url: 'rediss://auth.redis.local:6381',
      host: 'auth.redis.local',
      port: 6381,
      username: 'auth-user',
      password: 'auth-secret',
      tls: { rejectUnauthorized: true },
    });
  });

  it('rejeita protocolo que não seja redis ou rediss', () => {
    expect(() =>
      resolveRedisConnection({
        REDIS_URL: 'https://redis.example.com:6380',
      }),
    ).toThrow('Protocolo Redis inválido');
  });

  it('reconhece host loopback como redis local', () => {
    expect(isLoopbackHostname('localhost')).toBe(true);
    expect(isLoopbackHostname('127.0.0.1')).toBe(true);
    expect(isLoopbackHostname('::1')).toBe(true);
    expect(isLoopbackHostname('redis.internal')).toBe(false);
    expect(isLocalRedisConnection({ host: 'localhost' } as never)).toBe(true);
  });

  it('bloqueia Redis remoto sem TLS em produção', () => {
    expect(() =>
      assertSecureRedisConnection(
        {
          source: 'url',
          url: 'redis://default:REDACTED@redis.example.com:6379',
          host: 'redis.example.com',
          port: 6379,
        },
        'production',
      ),
    ).toThrow('Redis remoto em produção exige TLS');
  });

  it('aceita Redis remoto com TLS em produção', () => {
    expect(() =>
      assertSecureRedisConnection(
        {
          source: 'url',
          url: 'redis://default:REDACTED@redis.example.com:6380',
          host: 'redis.example.com',
          port: 6380,
          password: 'secret',
          tls: { rejectUnauthorized: true },
        },
        'production',
      ),
    ).not.toThrow();
  });

  it('bloqueia Redis remoto sem autenticação em produção', () => {
    expect(() =>
      assertSecureRedisConnection(
        {
          source: 'url',
          url: 'rediss://redis.example.com:6380',
          host: 'redis.example.com',
          port: 6380,
          tls: { rejectUnauthorized: true },
        },
        'production',
      ),
    ).toThrow('Redis remoto em produção exige autenticação');
  });

  it('aceita Redis local sem TLS fora de produção', () => {
    expect(() =>
      assertSecureRedisConnection(
        {
          source: 'host',
          host: '127.0.0.1',
          port: 6379,
        },
        'development',
      ),
    ).not.toThrow();
  });
});
