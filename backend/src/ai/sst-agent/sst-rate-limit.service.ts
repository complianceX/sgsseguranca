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
 * - Fail-open: se Redis estiver indisponível, permite a requisição
 *   (prioriza disponibilidade sobre controle exato de limite)
 *
 * Extensão futura:
 * - Limites diferenciados por plano do tenant (FREE/STARTER/PROFESSIONAL)
 * - Limites de tokens por dia via token_usage_input acumulado no DB
 * - Alertas quando tenant atinge 80% do limite diário
 */

import { Injectable, Inject, Logger, Optional } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../common/redis/redis.constants';
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

  constructor(
    @Optional() @Inject(REDIS_CLIENT) private readonly redis: Redis | null,
  ) {
    if (!this.redis) {
      this.logger.warn(
        '[SstRateLimit] Redis não disponível — rate limit desabilitado (fail-open)',
      );
    }
  }

  /**
   * Verifica e consome um slot de rate limit para o tenant.
   * Deve ser chamado ANTES de qualquer chamada à API do provedor de IA.
   *
   * @param tenantId - ID do tenant (company_id)
   * @returns SstRateLimitCheck com allowed=true se dentro dos limites
   */
  async checkAndConsume(tenantId: string): Promise<SstRateLimitCheck> {
    if (!this.redis) {
      return this.allowAll();
    }

    try {
      return await this.executeCheck(tenantId);
    } catch (err) {
      // Fail-open: erro no Redis não bloqueia o usuário
      this.logger.error(
        `[SstRateLimit] Erro ao verificar limite para tenant ${tenantId}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
      return this.allowAll();
    }
  }

  /**
   * Registra o consumo de tokens após a resposta do modelo.
   * Não bloqueia — apenas incrementa o contador para auditoria futura.
   */
  async recordTokenUsage(tenantId: string, tokens: number): Promise<void> {
    if (!this.redis || LIMITS.TOKENS_PER_DAY === 0 || tokens <= 0) return;

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

    // Incrementa ambos os contadores atomicamente
    const [minuteCount, dayCount] = await Promise.all([
      this.redis!.incr(minKey),
      this.redis!.incr(dayKey),
    ]);

    // Define TTL na primeira requisição da janela
    if (minuteCount === 1) await this.redis!.expire(minKey, 60);
    if (dayCount === 1) await this.redis!.expire(dayKey, 86_400);

    // Verifica limite por minuto
    if (minuteCount > LIMITS.REQUESTS_PER_MINUTE) {
      // Desfaz os incrementos para não distorcer contadores
      await this.safeDecrement(minKey);
      await this.safeDecrement(dayKey);

      this.logger.warn(
        `[SstRateLimit] Tenant ${tenantId} excedeu limite por minuto (${minuteCount}/${LIMITS.REQUESTS_PER_MINUTE})`,
      );

      return {
        allowed: false,
        retryAfterSeconds: 60,
        remaining: {
          perMinute: 0,
          perDay: Math.max(0, LIMITS.REQUESTS_PER_DAY - (dayCount - 1)),
        },
      };
    }

    // Verifica limite por dia
    if (dayCount > LIMITS.REQUESTS_PER_DAY) {
      await this.safeDecrement(minKey);
      await this.safeDecrement(dayKey);

      this.logger.warn(
        `[SstRateLimit] Tenant ${tenantId} excedeu limite diário (${dayCount}/${LIMITS.REQUESTS_PER_DAY})`,
      );

      return {
        allowed: false,
        retryAfterSeconds: this.secondsUntilMidnight(),
        remaining: {
          perMinute: Math.max(0, LIMITS.REQUESTS_PER_MINUTE - (minuteCount - 1)),
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

  private async safeDecrement(key: string): Promise<void> {
    try {
      await this.redis!.decr(key);
    } catch {
      // Silencioso
    }
  }

  private allowAll(): SstRateLimitCheck {
    return {
      allowed: true,
      remaining: {
        perMinute: LIMITS.REQUESTS_PER_MINUTE,
        perDay: LIMITS.REQUESTS_PER_DAY,
      },
    };
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
