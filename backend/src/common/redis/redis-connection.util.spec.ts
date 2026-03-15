import {
  isRedisExplicitlyDisabled,
  resolveRedisConnection,
} from './redis-connection.util';

describe('redis-connection.util', () => {
  it('resolve conexão a partir de REDIS_URL', () => {
    const connection = resolveRedisConnection({
      REDIS_URL: 'rediss://default:REDACTED@example.upstash.io:6380',
    } as NodeJS.ProcessEnv);

    expect(connection).toEqual({
      source: 'url',
      url: 'rediss://default:REDACTED@example.upstash.io:6380',
      host: 'example.upstash.io',
      port: 6380,
      username: 'default',
      password: 'secret',
      tls: { rejectUnauthorized: false },
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
        REDIS_URL: 'rediss://default:REDACTED@example.upstash.io:6380',
      } as NodeJS.ProcessEnv),
    ).toBeNull();
    expect(
      isRedisExplicitlyDisabled({
        REDIS_DISABLED: 'true',
      } as NodeJS.ProcessEnv),
    ).toBe(true);
  });
});
