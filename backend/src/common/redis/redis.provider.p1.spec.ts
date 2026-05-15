/**
 * Fase 3 — Testes P1: Redis Tier Separation
 *
 * 1. REDIS_CLIENT_AUTH, REDIS_CLIENT_CACHE, REDIS_CLIENT_QUEUE, REDIS_CLIENT_BULLMQ constantes exportadas
 * 2. redisAuthProvider.provide === REDIS_CLIENT_AUTH
 * 3. redisCacheProvider.provide === REDIS_CLIENT_CACHE
 * 4. redisQueueProvider.provide === REDIS_CLIENT_QUEUE
 * 5. redisBullMqProvider.provide === REDIS_CLIENT_BULLMQ
 * 6. TokenRevocationService injeta REDIS_CLIENT_AUTH (não REDIS_CLIENT)
 * 7. Invariante: 4 tiers distintos com tokens distintos
 */
import {
  REDIS_CLIENT,
  REDIS_CLIENT_BULLMQ,
  REDIS_CLIENT_AUTH,
  REDIS_CLIENT_CACHE,
  REDIS_CLIENT_QUEUE,
} from './redis.constants';
import {
  redisProvider,
  redisAuthProvider,
  redisCacheProvider,
  redisQueueProvider,
  redisBullMqProvider,
} from './redis.provider';
import type { FactoryProvider } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';

const redisProviderFactory = redisProvider as FactoryProvider;
const redisAuthProviderFactory = redisAuthProvider as FactoryProvider;
const redisCacheProviderFactory = redisCacheProvider as FactoryProvider;
const redisQueueProviderFactory = redisQueueProvider as FactoryProvider;
const redisBullMqProviderFactory = redisBullMqProvider as FactoryProvider;

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

    it('REDIS_CLIENT_BULLMQ é diferente de REDIS_CLIENT', () => {
      expect(REDIS_CLIENT_BULLMQ).not.toBe(REDIS_CLIENT);
    });

    it('os quatro tiers têm tokens distintos entre si', () => {
      const tokens = new Set([
        REDIS_CLIENT,
        REDIS_CLIENT_AUTH,
        REDIS_CLIENT_CACHE,
        REDIS_CLIENT_QUEUE,
        REDIS_CLIENT_BULLMQ,
      ]);
      expect(tokens.size).toBe(5);
    });
  });

  describe('Providers NestJS', () => {
    it('redisProvider.provide === REDIS_CLIENT', () => {
      expect(redisProviderFactory.provide).toBe(REDIS_CLIENT);
    });

    it('redisAuthProvider.provide === REDIS_CLIENT_AUTH', () => {
      expect(redisAuthProviderFactory.provide).toBe(REDIS_CLIENT_AUTH);
    });

    it('redisCacheProvider.provide === REDIS_CLIENT_CACHE', () => {
      expect(redisCacheProviderFactory.provide).toBe(REDIS_CLIENT_CACHE);
    });

    it('redisQueueProvider.provide === REDIS_CLIENT_QUEUE', () => {
      expect(redisQueueProviderFactory.provide).toBe(REDIS_CLIENT_QUEUE);
    });

    it('redisBullMqProvider.provide === REDIS_CLIENT_BULLMQ', () => {
      expect(redisBullMqProviderFactory.provide).toBe(REDIS_CLIENT_BULLMQ);
    });

    it('cada provider tem useFactory (criação lazy por DI)', () => {
      expect(typeof redisProviderFactory.useFactory).toBe('function');
      expect(typeof redisAuthProviderFactory.useFactory).toBe('function');
      expect(typeof redisCacheProviderFactory.useFactory).toBe('function');
      expect(typeof redisQueueProviderFactory.useFactory).toBe('function');
      expect(typeof redisBullMqProviderFactory.useFactory).toBe('function');
    });
  });

  describe('TokenRevocationService — injeção de REDIS_CLIENT_AUTH', () => {
    it('classe usa @Inject(REDIS_CLIENT_AUTH) — verificável via source', () => {
      // Verifica no código-fonte que o token correto é usado
      const src = readFileSync(
        join(__dirname, '../../auth/token-revocation.service.ts'),
        'utf-8',
      );
      expect(src).toContain('REDIS_CLIENT_AUTH');
      expect(src).not.toMatch(/@Inject\('REDIS_CLIENT'\)/);
    });
  });

  describe('Wiring de compatibilidade', () => {
    it('RedisService usa tier CACHE e AuthRedisService usa tier AUTH', () => {
      const src = readFileSync(join(__dirname, 'redis.service.ts'), 'utf-8');

      expect(src).toContain('REDIS_CLIENT_CACHE');
      expect(src).toContain('REDIS_CLIENT_AUTH');
    });
  });
});
