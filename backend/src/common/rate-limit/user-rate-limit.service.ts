import { Injectable, Inject } from '@nestjs/common';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { Redis } from 'ioredis';
import { randomUUID } from 'crypto';

const USER_WINDOW_MS = 60_000;
const USER_WINDOW_TTL_SECONDS = 60;

const SLIDING_WINDOW_SCRIPT = `
  redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, tonumber(ARGV[1]) - tonumber(ARGV[2]))
  redis.call('ZADD', KEYS[1], tonumber(ARGV[1]), ARGV[3])
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[4]))

  local count = redis.call('ZCARD', KEYS[1])
  local first = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  local earliest = ARGV[1]

  if first[2] then
    earliest = first[2]
  end

  return {count, earliest}
`;

export interface UserRateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

/**
 * Rate limiting por user_id via Redis sliding window de 60 segundos.
 *
 * Cada rota tem sua própria chave: user_rl:{userId}:{route}.
 * O conjunto ordenado armazena timestamps individuais, permitindo
 * bloquear bursts reais sem a distorção de janelas fixas por minuto.
 */
@Injectable()
export class UserRateLimitService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * Verifica e incrementa o contador do usuário para a rota.
   * @param userId  ID do usuário autenticado
   * @param route   Identificador da rota (ex: 'POST:/ai/sst/chat')
   * @param limit   Máximo de requisições por minuto
   */
  async checkLimit(
    userId: string,
    route: string,
    limit: number,
  ): Promise<UserRateLimitResult> {
    const now = Date.now();
    const key = `user_rl:${userId}:${route}`;
    const member = `${now}:${randomUUID()}`;

    const rawResult = await this.redis.eval(
      SLIDING_WINDOW_SCRIPT,
      1,
      key,
      String(now),
      String(USER_WINDOW_MS),
      member,
      String(USER_WINDOW_TTL_SECONDS),
    );

    if (!Array.isArray(rawResult) || rawResult.length < 2) {
      // Never silently allow requests when rate-limit storage is unhealthy.
      throw new Error('user_rate_limit_invalid_redis_eval_result');
    }

    const [countRaw, earliestRaw] = rawResult as [number | string, number | string];

    const count = Number(countRaw);
    const earliestScore = Number(earliestRaw);
    const resetAt = earliestScore + USER_WINDOW_MS;

    if (count > limit) {
      const retryAfter = Math.max(1, Math.ceil((resetAt - now) / 1000));
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfter,
      };
    }

    return {
      allowed: true,
      remaining: Math.max(0, limit - count),
      resetAt,
    };
  }

  /**
   * Retorna o uso atual de um usuário em múltiplas rotas.
   * Usado pelo endpoint de status admin.
   */
  async getUserUsage(
    userId: string,
    routes: string[],
  ): Promise<Record<string, number>> {
    const now = Date.now();
    const minScoreExclusive = `(${now - USER_WINDOW_MS}`;

    const entries = await Promise.all(
      routes.map(async (route) => {
        const key = `user_rl:${userId}:${route}`;
        const val = await this.redis.zcount(key, minScoreExclusive, '+inf');
        return [route, Number(val)] as const;
      }),
    );

    return Object.fromEntries(entries);
  }
}
