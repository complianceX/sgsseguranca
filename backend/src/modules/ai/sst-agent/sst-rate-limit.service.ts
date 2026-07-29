/**
 * SstRateLimitService — Rate limit específico para o Agente SST.
 *
 * Limites por tenant (configuráveis via constantes):
 * - Requisições por minuto: protege contra burst abusivo
 * - Requisições por dia: controle de orçamento diário
 * - Tokens por dia: controle de custo (futuro)
 *
 * Implementação:
 * - Usa Redis (ioredis) com chaves TTL — sliding window simplificado
 * - Em degradação de Redis, cai para fallback local em memória
 *   (preserva contenção mínima em vez de fail-open)
 *
 * Extensão futura:
 * - Limites diferenciados por plano do tenant (FREE/STARTER/PROFESSIONAL)
 * - Limites de tokens por dia via token_usage_input acumulado no DB
 * - Alertas quando tenant atinge 80% do limite diário
 */

import {
  Injectable,
  Inject,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT_RATE_LIMIT } from '../../../shared/redis/redis.constants';
import { SstRateLimitCheck } from './sst-agent.types';

// ---------------------------------------------------------------------------
// Configuração de limites (por tenant, plano padrão)
// Futura melhoria: buscar do DB por plano do tenant
// ---------------------------------------------------------------------------

const LIMITS = {
  /** Máximo de chamadas ao agente SST por minuto por tenant. */
  REQUESTS_PER_MINUTE: 10,
  /** Máximo de chamadas ao agente SST por dia por tenant. */
  REQUESTS_PER_DAY: 200,
  /** Máximo de tokens consumidos por dia por tenant (0 = sem limite). */
  TOKENS_PER_DAY: 0,
} as const;

@Injectable()
export class SstRateLimitService {
  private readonly logger = new Logger(SstRateLimitService.name);
  private readonly localCounters = new Map<
    string,
    { value: number; expiresAt: number }
  >();

  constructor(
    @Inject(REDIS_CLIENT_RATE_LIMIT)
    private readonly redis: Redis,
  ) {}

  /**
   * Verifica e consome um slot de rate limit para o tenant.
   * Deve ser chamado ANTES de qualquer chamada à API do provedor de IA.
   *
   * @param tenantId - ID do tenant (company_id)
   * @returns SstRateLimitCheck com allowed=true se dentro dos limites
   */
  async checkAndConsume(tenantId: string): Promise<SstRateLimitCheck> {
    try {
      return await this.executeCheck(tenantId);
    } catch (err) {
      this.logger.error(
        `[SstRateLimit] Erro no Redis para tenant ${tenantId}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
      if (process.env.NODE_ENV === 'production') {
        throw new ServiceUnavailableException(
          'Controle de limite da Sophie temporariamente indisponível.',
        );
      }
      return this.executeLocalCheck(tenantId);
    }
  }

  /**
   * Registra o consumo de tokens após a resposta do modelo.
   * Não bloqueia — apenas incrementa o contador para auditoria futura.
   */
  async recordTokenUsage(tenantId: string, tokens: number): Promise<void> {
    if (LIMITS.TOKENS_PER_DAY === 0 || tokens <= 0) return;

    try {
      const key = this.tokensDayKey(tenantId);
      await this.redis.incrby(key, tokens);
      await this.redis.expire(key, 86_400); // TTL: 24h
    } catch {
      // Silencioso — não crítico
    }
  }

  // -------------------------------------------------------------------------
  // Privado
  // -------------------------------------------------------------------------

  private async executeCheck(tenantId: string): Promise<SstRateLimitCheck> {
    const minKey = this.minuteKey(tenantId);
    const dayKey = this.dayKey(tenantId);
    const script = `
      local minute = redis.call('INCR', KEYS[1])
      if minute == 1 then redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1])) end
      local daily = redis.call('INCR', KEYS[2])
      if daily == 1 then redis.call('EXPIRE', KEYS[2], tonumber(ARGV[2])) end
      local minute_ttl = redis.call('TTL', KEYS[1])
      local daily_ttl = redis.call('TTL', KEYS[2])
      if minute > tonumber(ARGV[3]) or daily > tonumber(ARGV[4]) then
        minute = redis.call('DECR', KEYS[1])
        daily = redis.call('DECR', KEYS[2])
        return {0, minute, daily, minute_ttl, daily_ttl}
      end
      return {1, minute, daily, minute_ttl, daily_ttl}
    `;
    const result = (await this.redis.eval(
      script,
      2,
      minKey,
      dayKey,
      '60',
      String(this.secondsUntilMidnight()),
      String(LIMITS.REQUESTS_PER_MINUTE),
      String(LIMITS.REQUESTS_PER_DAY),
    )) as [number, number, number, number, number];
    const allowed = Number(result[0]) === 1;
    const minuteCount = Number(result[1]);
    const dayCount = Number(result[2]);
    const minuteTtl = Math.max(Number(result[3]), 1);
    const dayTtl = Math.max(Number(result[4]), 1);

    if (!allowed) {
      const minuteExceeded = minuteCount >= LIMITS.REQUESTS_PER_MINUTE;
      return {
        allowed: false,
        retryAfterSeconds: minuteExceeded ? minuteTtl : dayTtl,
        remaining: {
          perMinute: Math.max(0, LIMITS.REQUESTS_PER_MINUTE - minuteCount),
          perDay: Math.max(0, LIMITS.REQUESTS_PER_DAY - dayCount),
        },
      };
    }

    return {
      allowed: true,
      remaining: {
        perMinute: Math.max(0, LIMITS.REQUESTS_PER_MINUTE - minuteCount),
        perDay: Math.max(0, LIMITS.REQUESTS_PER_DAY - dayCount),
      },
    };
  }

  private executeLocalCheck(tenantId: string): SstRateLimitCheck {
    const minuteCount = this.bumpLocalCounter(this.minuteKey(tenantId), 60);
    const dayCount = this.bumpLocalCounter(this.dayKey(tenantId), 86_400);

    if (minuteCount > LIMITS.REQUESTS_PER_MINUTE) {
      this.safeLocalDecrement(this.minuteKey(tenantId));
      this.safeLocalDecrement(this.dayKey(tenantId));

      return {
        allowed: false,
        retryAfterSeconds: 60,
        remaining: {
          perMinute: 0,
          perDay: Math.max(0, LIMITS.REQUESTS_PER_DAY - (dayCount - 1)),
        },
      };
    }

    if (dayCount > LIMITS.REQUESTS_PER_DAY) {
      this.safeLocalDecrement(this.minuteKey(tenantId));
      this.safeLocalDecrement(this.dayKey(tenantId));

      return {
        allowed: false,
        retryAfterSeconds: this.secondsUntilMidnight(),
        remaining: {
          perMinute: Math.max(
            0,
            LIMITS.REQUESTS_PER_MINUTE - (minuteCount - 1),
          ),
          perDay: 0,
        },
      };
    }

    return {
      allowed: true,
      remaining: {
        perMinute: Math.max(0, LIMITS.REQUESTS_PER_MINUTE - minuteCount),
        perDay: Math.max(0, LIMITS.REQUESTS_PER_DAY - dayCount),
      },
    };
  }

  private bumpLocalCounter(key: string, ttlSeconds: number): number {
    const now = Date.now();
    const current = this.localCounters.get(key);
    if (!current || current.expiresAt <= now) {
      this.localCounters.set(key, {
        value: 1,
        expiresAt: now + ttlSeconds * 1000,
      });
      return 1;
    }

    current.value += 1;
    this.localCounters.set(key, current);
    return current.value;
  }

  private safeLocalDecrement(key: string): void {
    const current = this.localCounters.get(key);
    if (!current) {
      return;
    }

    if (current.value <= 1) {
      this.localCounters.delete(key);
      return;
    }

    current.value -= 1;
    this.localCounters.set(key, current);
  }

  // Chaves Redis
  private minuteKey(tenantId: string): string {
    const window = Math.floor(Date.now() / 60_000);
    return `sst:rl:min:${tenantId}:${window}`;
  }

  private dayKey(tenantId: string): string {
    const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return `sst:rl:day:${tenantId}:${day}`;
  }

  private tokensDayKey(tenantId: string): string {
    const day = new Date().toISOString().slice(0, 10);
    return `sst:rl:tokens:${tenantId}:${day}`;
  }

  private secondsUntilMidnight(): number {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return Math.ceil((midnight.getTime() - now.getTime()) / 1_000);
  }
}
