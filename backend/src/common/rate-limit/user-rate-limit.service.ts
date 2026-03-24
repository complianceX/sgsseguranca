import { Injectable, Inject } from '@nestjs/common';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { Redis } from 'ioredis';

const INCR_WITH_TTL = `
  local c = redis.call('INCR', KEYS[1])
  if c == 1 then redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1])) end
  return c
`;

export interface UserRateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

/**
 * Rate limiting por user_id via Redis sliding window (janela de 1 minuto).
 *
 * Cada rota tem sua própria chave: user_rl:{userId}:{route}:{window}.
 * A janela é o minuto atual (timestamp / 60000), garantindo expiração
 * automática sem acúmulo de chaves no Redis.
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
    const window = Math.floor(now / 60_000);
    const key = `user_rl:${userId}:${route}:${window}`;

    const count = (await this.redis.eval(
      INCR_WITH_TTL,
      1,
      key,
      '60',
    )) as number;

    if (count > limit) {
      const retryAfter = 60 - Math.floor((now % 60_000) / 1000);
      return {
        allowed: false,
        remaining: 0,
        resetAt: (window + 1) * 60_000,
        retryAfter,
      };
    }

    return {
      allowed: true,
      remaining: limit - count,
      resetAt: (window + 1) * 60_000,
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
    const window = Math.floor(now / 60_000);

    const entries = await Promise.all(
      routes.map(async (route) => {
        const key = `user_rl:${userId}:${route}:${window}`;
        const val = await this.redis.get(key);
        return [route, parseInt(val ?? '0', 10)] as const;
      }),
    );

    return Object.fromEntries(entries);
  }
}
