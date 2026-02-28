import { Injectable, Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';

export interface IdempotencyRecord {
  status: 'processing' | 'completed';
  statusCode?: number;
  body?: unknown;
  createdAt: number;
}

const TTL_SECONDS = 86400; // 24 horas

@Injectable()
export class IdempotencyService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private buildKey(
    tenantId: string | undefined,
    method: string,
    path: string,
    idempotencyKey: string,
  ): string {
    const tenant = tenantId || 'anonymous';
    return `idempotency:${tenant}:${method}:${path}:${idempotencyKey}`;
  }

  /**
   * Marca a chave como "em processamento".
   * Usa SET NX para garantir que apenas uma request concurrent vence a corrida.
   * Retorna true se conseguiu marcar (primeira requisição), false se já existe.
   */
  async markProcessing(
    tenantId: string | undefined,
    method: string,
    path: string,
    idempotencyKey: string,
  ): Promise<boolean> {
    const key = this.buildKey(tenantId, method, path, idempotencyKey);
    const record: IdempotencyRecord = {
      status: 'processing',
      createdAt: Date.now(),
    };

    // NX = só grava se não existir; EX = TTL em segundos
    const result = await this.redis.set(
      key,
      JSON.stringify(record),
      'EX',
      TTL_SECONDS,
      'NX',
    );

    return result === 'OK';
  }

  /**
   * Salva a resposta final para a chave idempotente.
   */
  async saveResponse(
    tenantId: string | undefined,
    method: string,
    path: string,
    idempotencyKey: string,
    statusCode: number,
    body: unknown,
  ): Promise<void> {
    const key = this.buildKey(tenantId, method, path, idempotencyKey);
    const record: IdempotencyRecord = {
      status: 'completed',
      statusCode,
      body,
      createdAt: Date.now(),
    };

    await this.redis.set(key, JSON.stringify(record), 'EX', TTL_SECONDS);
  }

  /**
   * Remove a chave (usado em caso de erro para permitir retry com a mesma chave).
   */
  async deleteRecord(
    tenantId: string | undefined,
    method: string,
    path: string,
    idempotencyKey: string,
  ): Promise<void> {
    const key = this.buildKey(tenantId, method, path, idempotencyKey);
    await this.redis.del(key);
  }

  /**
   * Busca um registro existente para a chave idempotente.
   */
  async getRecord(
    tenantId: string | undefined,
    method: string,
    path: string,
    idempotencyKey: string,
  ): Promise<IdempotencyRecord | null> {
    const key = this.buildKey(tenantId, method, path, idempotencyKey);
    const raw = await this.redis.get(key);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as IdempotencyRecord;
    } catch {
      return null;
    }
  }
}
