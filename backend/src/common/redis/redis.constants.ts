export const REDIS_CLIENT = 'REDIS_CLIENT';

/**
 * P1 — Redis separado por criticidade.
 *
 * REDIS_CLIENT_AUTH  : tokens de sessão/refresh, revogação de JTI.
 *                      Política: noeviction — nunca pode perder chaves de sessão.
 *
 * REDIS_CLIENT_CACHE : cache de dashboard, rate-limit.
 *                      Política: allkeys-lru — pode evictar sob pressão.
 *
 * REDIS_CLIENT_QUEUE : reservado para integração futura com BullMQ dedicado.
 *                      BullMQ já usa sua própria conexão (forRoot connection option).
 *
 * REDIS_CLIENT_BULLMQ : conexão dedicada ao BullMQ com maxRetriesPerRequest=null.
 */
export const REDIS_CLIENT_AUTH = 'REDIS_CLIENT_AUTH';
export const REDIS_CLIENT_CACHE = 'REDIS_CLIENT_CACHE';
export const REDIS_CLIENT_QUEUE = 'REDIS_CLIENT_QUEUE';
export const REDIS_CLIENT_BULLMQ = 'REDIS_CLIENT_BULLMQ';
