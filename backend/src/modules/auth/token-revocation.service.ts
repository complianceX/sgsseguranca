import { Injectable, Inject, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT_AUTH } from '../../shared/redis/redis.constants';
import { captureException } from '../../shared/monitoring/sentry';

/**
 * Cache local de JTIs revogados recentemente.
 *
 * Serve dois propósitos:
 *  1. Cobertura durante outages transitórios do Redis auth (até `defaultTtlMs`)
 *  2. Evitar round-trip ao Redis para tokens recém-revogados neste pod
 *
 * Evicção: FIFO de inserção ao atingir `maxSize` + TTL por entrada.
 * Map em JS preserva ordem de inserção, então a primeira chave é sempre a mais antiga.
 */
class RevokedTokenCache {
  private readonly entries = new Map<string, number>(); // jti → expiresAt (epoch ms)

  constructor(
    private readonly maxSize: number,
    private readonly defaultTtlMs: number,
  ) {}

  set(jti: string, ttlMs?: number): void {
    const effectiveTtlMs = ttlMs ?? this.defaultTtlMs;
    if (this.entries.size >= this.maxSize) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(jti, Date.now() + effectiveTtlMs);
  }

  has(jti: string): boolean {
    const expiresAt = this.entries.get(jti);
    if (expiresAt === undefined) return false;
    if (Date.now() > expiresAt) {
      this.entries.delete(jti);
      return false;
    }
    return true;
  }

  get size(): number {
    return this.entries.size;
  }
}

@Injectable()
export class TokenRevocationService {
  // P1: usa tier AUTH (noeviction) — tokens de revogação nunca podem ser evictados
  private readonly logger = new Logger(TokenRevocationService.name);

  /**
   * Cache local de JTIs revogados recentemente.
   * TTL de 60s cobre outages transitórios do Redis.
   * Cap de 2000 entradas equivale a ~2000 logouts simultâneos no mesmo pod —
   * bem acima do pico esperado; caso estoure, evicta o mais antigo (FIFO).
   */
  private readonly localBlacklist = new RevokedTokenCache(2_000, 60_000);

  constructor(@Inject(REDIS_CLIENT_AUTH) private readonly redis: Redis) {}

  private getKey(tokenId: string): string {
    return `revoked-token:${tokenId}`;
  }

  /**
   * Revoga um refresh token impedindo seu uso futuro.
   *
   * Escreve no cache local imediatamente (efetivo neste pod) e persiste no Redis.
   * Se o Redis estiver indisponível, loga o aviso mas não propaga o erro:
   * a revogação local cobre este pod por 60s; tokens têm TTL de 15min.
   */
  async revoke(tokenId: string, expiresInSeconds: number): Promise<void> {
    // Cache local antes do Redis garante revogação imediata neste pod
    this.localBlacklist.set(tokenId);
    try {
      const key = this.getKey(tokenId);
      await this.redis.set(key, 'revoked', 'EX', expiresInSeconds);
    } catch (error) {
      this.logger.warn(
        `[TokenRevocation] Falha ao persistir revogação no Redis — revogado apenas localmente (60s). jti=${tokenId.slice(0, 8)}... erro=${error instanceof Error ? error.message : String(error)}`,
      );
      captureException(error, {
        tags: { 'redis.auth.unavailable': 'true', operation: 'revoke' },
        extra: { jtiPrefix: tokenId.slice(0, 8) },
      });
    }
  }

  /**
   * Verifica se um token foi revogado.
   *
   * Estratégia de 2 camadas:
   *  1. Cache local em memória (sub-ms, cobre outages de Redis por até 60s)
   *  2. Redis — fonte da verdade persistida
   *
   * Fail-open quando o Redis está indisponível: retorna `false` em vez de propagar erro.
   * Justificativa: access tokens têm TTL de 15min — janela de risco aceitável
   * vs derrubar 100% das rotas autenticadas durante um outage do Redis auth.
   */
  async isRevoked(tokenId: string): Promise<boolean> {
    // 1. Cache local — cobre tokens recém-revogados neste pod e outages de Redis
    if (this.localBlacklist.has(tokenId)) {
      return true;
    }

    // 2. Redis — fonte da verdade
    try {
      const key = this.getKey(tokenId);
      const result = await this.redis.get(key);
      if (result === 'revoked') {
        // Populamos o cache local para: (a) evitar round-trips futuros e
        // (b) manter o bloqueio durante eventual outage de Redis logo após
        this.localBlacklist.set(tokenId);
        return true;
      }
      return false;
    } catch (error) {
      // Redis auth indisponível — fail-open para preservar disponibilidade da API.
      // Tokens têm TTL de 15min; tokens no cache local continuam bloqueados.
      this.logger.warn(
        `[TokenRevocation] Redis auth indisponível — fail-open ativado. jti=${tokenId.slice(0, 8)}... erro=${error instanceof Error ? error.message : String(error)}`,
      );
      captureException(error, {
        tags: { 'redis.auth.unavailable': 'true', operation: 'isRevoked' },
        extra: { jtiPrefix: tokenId.slice(0, 8) },
      });
      return false;
    }
  }
}
