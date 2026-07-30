import {
  buildRedisKeyvUrl,
  DEFAULT_CACHE_TTL_MS,
} from './redis-keyv-cache.util';

describe('redis-keyv-cache.util', () => {
  it('converte URL redis para rediss quando TLS está habilitado', () => {
    expect(
      buildRedisKeyvUrl({
        source: 'url',
        url: 'redis://cache-user:cache-secret@cache.example.com:6380/2',
        host: 'cache.example.com',
        port: 6380,
        username: 'cache-user',
        password: 'cache-secret',
        tls: { rejectUnauthorized: true },
      }),
    ).toBe('rediss://cache-user:cache-secret@cache.example.com:6380/2');
  });

  it('constrói URL a partir de host sem perder credenciais', () => {
    expect(
      buildRedisKeyvUrl({
        source: 'host',
        host: '127.0.0.1',
        port: 6379,
        username: 'cache-user',
        password: 'cache-secret',
      }),
    ).toBe('redis://cache-user:cache-secret@127.0.0.1:6379');
  });

  it('constrói URL válida para host IPv6', () => {
    expect(
      buildRedisKeyvUrl({
        source: 'host',
        host: '::1',
        port: 6379,
      }),
    ).toBe('redis://[::1]:6379');
  });

  it('injeta na URL as credenciais resolvidas por variável separada', () => {
    expect(
      buildRedisKeyvUrl({
        source: 'url',
        url: 'rediss://cache.example.com:6380/2',
        host: 'cache.example.com',
        port: 6380,
        username: 'cache-user',
        password: 'cache-secret',
        tls: { rejectUnauthorized: true },
      }),
    ).toBe('rediss://cache-user:cache-secret@cache.example.com:6380/2');
  });

  it('define TTL default em milissegundos', () => {
    expect(DEFAULT_CACHE_TTL_MS).toBe(300_000);
  });
});
