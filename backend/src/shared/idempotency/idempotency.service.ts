import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { Redis } from 'ioredis';
import { REDIS_CLIENT_RATE_LIMIT } from '../redis/redis.constants';

export interface IdempotencyRecord {
  status: 'processing' | 'completed';
  requestHash: string;
  statusCode?: number;
  body?: unknown;
  responseStored?: boolean;
  createdAt: number;
}

export type MarkProcessingResult = 'acquired' | 'exists' | 'quota_exceeded';

const DEFAULT_TTL_SECONDS = 3600;
const MIN_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = 86400;
const DEFAULT_MAX_RESPONSE_BYTES = 65536;
const MIN_MAX_RESPONSE_BYTES = 1024;
const MAX_MAX_RESPONSE_BYTES = 1048576;
const DEFAULT_MAX_KEYS_PER_SCOPE = 100;
const MIN_MAX_KEYS_PER_SCOPE = 1;
const MAX_MAX_KEYS_PER_SCOPE = 1000;

@Injectable()
export class IdempotencyService {
  private readonly ttlSeconds: number;
  private readonly maxResponseBytes: number;
  private readonly maxKeysPerScope: number;

  constructor(
    @Inject(REDIS_CLIENT_RATE_LIMIT) private readonly redis: Redis,
    configService: ConfigService,
  ) {
    this.ttlSeconds = this.readBoundedInteger(
      configService,
      'IDEMPOTENCY_TTL_SECONDS',
      DEFAULT_TTL_SECONDS,
      MIN_TTL_SECONDS,
      MAX_TTL_SECONDS,
    );
    this.maxResponseBytes = this.readBoundedInteger(
      configService,
      'IDEMPOTENCY_MAX_RESPONSE_BYTES',
      DEFAULT_MAX_RESPONSE_BYTES,
      MIN_MAX_RESPONSE_BYTES,
      MAX_MAX_RESPONSE_BYTES,
    );
    this.maxKeysPerScope = this.readBoundedInteger(
      configService,
      'IDEMPOTENCY_MAX_KEYS_PER_SCOPE',
      DEFAULT_MAX_KEYS_PER_SCOPE,
      MIN_MAX_KEYS_PER_SCOPE,
      MAX_MAX_KEYS_PER_SCOPE,
    );
  }

  private readBoundedInteger(
    configService: ConfigService,
    key: string,
    fallback: number,
    minimum: number,
    maximum: number,
  ): number {
    const configured = configService.get<number | string>(key);
    const parsed =
      typeof configured === 'number'
        ? configured
        : Number.parseInt(configured ?? '', 10);

    if (!Number.isInteger(parsed)) {
      return fallback;
    }

    return Math.min(maximum, Math.max(minimum, parsed));
  }

  private buildKey(
    scopeId: string,
    method: string,
    path: string,
    idempotencyKey: string,
  ): string {
    return `idempotency:${scopeId}:${method}:${path}:${idempotencyKey}`;
  }

  private buildQuotaKey(scopeId: string): string {
    const scopeHash = createHash('sha256').update(scopeId).digest('hex');
    return `idempotency:quota:${scopeHash}`;
  }

  /**
   * Marca a chave como "em processamento".
   * Usa SET NX para garantir que apenas uma request concurrent vence a corrida.
   * Retorna true se conseguiu marcar (primeira requisição), false se já existe.
   */
  async markProcessing(
    scopeId: string,
    method: string,
    path: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<MarkProcessingResult> {
    const key = this.buildKey(scopeId, method, path, idempotencyKey);
    const record: IdempotencyRecord = {
      status: 'processing',
      requestHash,
      createdAt: Date.now(),
    };

    // NX = só grava se não existir; EX = TTL em segundos
    const result = await this.redis.set(
      key,
      JSON.stringify(record),
      'EX',
      this.ttlSeconds,
      'NX',
    );

    if (result !== 'OK') {
      return 'exists';
    }

    const quotaKey = this.buildQuotaKey(scopeId);
    try {
      const currentCount = await this.redis.incr(quotaKey);
      if (currentCount === 1) {
        await this.redis.expire(quotaKey, this.ttlSeconds);
      }

      if (currentCount > this.maxKeysPerScope) {
        await this.redis.del(key);
        await this.redis.decr(quotaKey).catch(() => undefined);
        return 'quota_exceeded';
      }
    } catch (error) {
      await this.redis.del(key).catch(() => undefined);
      await this.redis.decr(quotaKey).catch(() => undefined);
      throw error;
    }

    return 'acquired';
  }

  /**
   * Salva a resposta final para a chave idempotente.
   */
  async saveResponse(
    scopeId: string,
    method: string,
    path: string,
    idempotencyKey: string,
    requestHash: string,
    statusCode: number,
    body: unknown,
  ): Promise<void> {
    const key = this.buildKey(scopeId, method, path, idempotencyKey);
    let serializedBody: string | undefined;
    try {
      serializedBody = JSON.stringify(body);
    } catch {
      serializedBody = undefined;
    }
    const responseStored =
      serializedBody !== undefined &&
      Buffer.byteLength(serializedBody, 'utf8') <= this.maxResponseBytes;
    const record: IdempotencyRecord = {
      status: 'completed',
      requestHash,
      statusCode,
      ...(responseStored ? { body } : {}),
      responseStored,
      createdAt: Date.now(),
    };

    await this.redis.set(key, JSON.stringify(record), 'EX', this.ttlSeconds);
  }

  /**
   * Remove a chave (usado em caso de erro para permitir retry com a mesma chave).
   */
  async deleteRecord(
    scopeId: string,
    method: string,
    path: string,
    idempotencyKey: string,
  ): Promise<void> {
    const key = this.buildKey(scopeId, method, path, idempotencyKey);
    const removed = await this.redis.del(key);
    if (removed > 0) {
      await this.redis.decr(this.buildQuotaKey(scopeId)).catch(() => undefined);
    }
  }

  /**
   * Busca um registro existente para a chave idempotente.
   */
  async getRecord(
    scopeId: string,
    method: string,
    path: string,
    idempotencyKey: string,
  ): Promise<IdempotencyRecord | null> {
    const key = this.buildKey(scopeId, method, path, idempotencyKey);
    const raw = await this.redis.get(key);
    if (!raw) return null;

    try {
      const parsed: unknown = JSON.parse(raw);
      if (!this.isIdempotencyRecord(parsed)) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private isIdempotencyRecord(value: unknown): value is IdempotencyRecord {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const record = value as Record<string, unknown>;
    return (
      (record.status === 'processing' || record.status === 'completed') &&
      typeof record.requestHash === 'string' &&
      record.requestHash.length === 64 &&
      typeof record.createdAt === 'number' &&
      (record.statusCode === undefined ||
        (typeof record.statusCode === 'number' &&
          Number.isInteger(record.statusCode))) &&
      (record.responseStored === undefined ||
        typeof record.responseStored === 'boolean')
    );
  }
}
