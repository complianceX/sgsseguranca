/**
 * Fase 3 — Testes P1: Redis Tier Separation
 *
 * 1. REDIS_CLIENT_AUTH, REDIS_CLIENT_CACHE, REDIS_CLIENT_QUEUE constantes exportadas
 * 2. redisAuthProvider.provide === REDIS_CLIENT_AUTH
 * 3. redisCacheProvider.provide === REDIS_CLIENT_CACHE
 * 4. redisQueueProvider.provide === REDIS_CLIENT_QUEUE
 * 5. TokenRevocationService injeta REDIS_CLIENT_AUTH (não REDIS_CLIENT)
 * 6. Invariante: 3 tiers distintos com tokens distintos
 */
import {
  REDIS_CLIENT,
  REDIS_CLIENT_AUTH,
  REDIS_CLIENT_CACHE,
  REDIS_CLIENT_QUEUE,
} from './redis.constants';
import {
  redisProvider,
  redisAuthProvider,
  redisCacheProvider,
  redisQueueProvider,
} from './redis.provider';

describe('Redis — Tier Separation (P1)', () => {
  describe('Constantes dos tiers', () => {
    it('REDIS_CLIENT_AUTH é diferente de REDIS_CLIENT', () => {
      expect(REDIS_CLIENT_AUTH).not.toBe(REDIS_CLIENT);
    });

    it('REDIS_CLIENT_CACHE é diferente de REDIS_CLIENT', () => {
      expect(REDIS_CLIENT_CACHE).not.toBe(REDIS_CLIENT);
    });

    it('REDIS_CLIENT_QUEUE é diferente de REDIS_CLIENT', () => {
      expect(REDIS_CLIENT_QUEUE).not.toBe(REDIS_CLIENT);
    });

    it('os três tiers têm tokens distintos entre si', () => {
      const tokens = new Set([
        REDIS_CLIENT,
        REDIS_CLIENT_AUTH,
        REDIS_CLIENT_CACHE,
        REDIS_CLIENT_QUEUE,
      ]);
      expect(tokens.size).toBe(4);
    });
  });

  describe('Providers NestJS', () => {
    it('redisProvider.provide === REDIS_CLIENT', () => {
      expect(redisProvider.provide).toBe(REDIS_CLIENT);
    });

    it('redisAuthProvider.provide === REDIS_CLIENT_AUTH', () => {
      expect(redisAuthProvider.provide).toBe(REDIS_CLIENT_AUTH);
    });

    it('redisCacheProvider.provide === REDIS_CLIENT_CACHE', () => {
      expect(redisCacheProvider.provide).toBe(REDIS_CLIENT_CACHE);
    });

    it('redisQueueProvider.provide === REDIS_CLIENT_QUEUE', () => {
      expect(redisQueueProvider.provide).toBe(REDIS_CLIENT_QUEUE);
    });

    it('cada provider tem useFactory (criação lazy por DI)', () => {
      expect(typeof redisProvider.useFactory).toBe('function');
      expect(typeof redisAuthProvider.useFactory).toBe('function');
      expect(typeof redisCacheProvider.useFactory).toBe('function');
      expect(typeof redisQueueProvider.useFactory).toBe('function');
    });
  });

  describe('TokenRevocationService — injeção de REDIS_CLIENT_AUTH', () => {
    it('classe usa @Inject(REDIS_CLIENT_AUTH) — verificável via source', () => {
      // Verifica no código-fonte que o token correto é usado
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const src = require('fs').readFileSync(
        require('path').join(
          __dirname,
          '../../auth/token-revocation.service.ts',
        ),
        'utf-8',
      ) as string;
      expect(src).toContain('REDIS_CLIENT_AUTH');
      expect(src).not.toMatch(/@Inject\('REDIS_CLIENT'\)/);
    });
  });

  describe('Wiring de compatibilidade', () => {
    it('RedisService usa tier CACHE e AuthRedisService usa tier AUTH', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const src = require('fs').readFileSync(
        require('path').join(__dirname, 'redis.service.ts'),
        'utf-8',
      ) as string;

      expect(src).toContain('REDIS_CLIENT_CACHE');
      expect(src).toContain('REDIS_CLIENT_AUTH');
    });
  });
});
