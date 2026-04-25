import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { RequestContext } from '../common/middleware/request-context.middleware';
import { ForensicTrailEvent } from './entities/forensic-trail-event.entity';

type ForensicMetadata = Record<string, unknown> | null | undefined;

export type AppendForensicTrailEventInput = {
  eventType: string;
  module: string;
  entityId: string;
  companyId?: string | null;
  userId?: string | null;
  requestId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: ForensicMetadata;
  occurredAt?: Date;
};

type CanonicalJsonValue =
  | null
  | boolean
  | number
  | string
  | CanonicalJsonValue[]
  | { [key: string]: CanonicalJsonValue };

@Injectable()
export class ForensicTrailService {
  private readonly logger = new Logger(ForensicTrailService.name);

  constructor(
    @InjectRepository(ForensicTrailEvent)
    private readonly forensicTrailRepository: Repository<ForensicTrailEvent>,
    private readonly dataSource: DataSource,
  ) {}

  async append(
    input: AppendForensicTrailEventInput,
    options?: { manager?: EntityManager },
  ): Promise<ForensicTrailEvent> {
    const companyId = input.companyId ?? RequestContext.getCompanyId() ?? null;
    const userId = input.userId ?? RequestContext.getUserId() ?? null;
    const requestId = input.requestId ?? RequestContext.getRequestId() ?? null;
    const ip = input.ip ?? RequestContext.get<string>('ip') ?? null;
    const userAgent =
      input.userAgent ?? RequestContext.get<string>('userAgent') ?? null;
    const streamKey = this.buildStreamKey(
      companyId,
      input.module,
      input.entityId,
    );
    const occurredAt = input.occurredAt ?? new Date();

    const execute = async (manager: EntityManager) => {
      const repository = manager.getRepository(ForensicTrailEvent);
      await this.acquireStreamLock(manager, streamKey);

      const previousEvent = await repository.findOne({
        where: { stream_key: streamKey },
        order: { stream_sequence: 'DESC' },
      });

      const streamSequence = (previousEvent?.stream_sequence ?? 0) + 1;
      const normalizedMetadata = this.normalizeMetadata(input.metadata);
      const eventHash = this.computeEventHash({
        streamKey,
        streamSequence,
        eventType: input.eventType,
        module: input.module,
        entityId: input.entityId,
        companyId,
        userId,
        requestId,
        ip,
        userAgent,
        previousEventHash: previousEvent?.event_hash ?? null,
        occurredAt,
        metadata: normalizedMetadata,
      });

      const event = repository.create({
        stream_key: streamKey,
        stream_sequence: streamSequence,
        event_type: input.eventType,
        module: input.module,
        entity_id: input.entityId,
        company_id: companyId,
        user_id: userId,
        request_id: requestId,
        ip,
        user_agent: userAgent,
        metadata:
          (normalizedMetadata as Record<string, unknown> | null) ?? null,
        previous_event_hash: previousEvent?.event_hash ?? null,
        event_hash: eventHash,
        occurred_at: occurredAt,
      });

      return repository.save(event);
    };

    if (options?.manager) {
      return execute(options.manager);
    }

    return this.dataSource.transaction(async (manager) => {
      await this.prepareInternalAppendContext(manager);
      return execute(manager);
    });
  }

  private async prepareInternalAppendContext(
    manager: EntityManager,
  ): Promise<void> {
    if (this.dataSource.options.type !== 'postgres') {
      return;
    }

    await manager.query("SET LOCAL app.is_super_admin = 'true'");
  }

  private buildStreamKey(
    companyId: string | null,
    module: string,
    entityId: string,
  ): string {
    return `${companyId || 'global'}:${module}:${entityId}`;
  }

  private async acquireStreamLock(
    manager: EntityManager,
    streamKey: string,
  ): Promise<void> {
    if (this.dataSource.options.type !== 'postgres') {
      return;
    }

    try {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        streamKey,
      ]);
    } catch (error) {
      this.logger.warn(
        `Falha ao adquirir lock transacional da trilha forense para ${streamKey}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  }

  private normalizeMetadata(input: ForensicMetadata): CanonicalJsonValue {
    if (!input) {
      return null;
    }

    return this.normalizeValue(input);
  }

  private normalizeValue(value: unknown): CanonicalJsonValue {
    if (value === null || value === undefined) {
      return null;
    }

    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.normalizeValue(item));
    }

    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const normalizedEntries = Object.keys(record)
        .sort()
        .flatMap((key) => {
          const normalized = this.normalizeValue(record[key]);
          if (normalized === null && record[key] === undefined) {
            return [];
          }
          return [[key, normalized] as const];
        });

      return Object.fromEntries(normalizedEntries);
    }

    if (typeof value === 'bigint') {
      return value.toString();
    }

    if (typeof value === 'symbol') {
      return value.toString();
    }

    if (typeof value === 'function') {
      return '[function]';
    }

    return '[unknown]';
  }

  private computeEventHash(input: {
    streamKey: string;
    streamSequence: number;
    eventType: string;
    module: string;
    entityId: string;
    companyId: string | null;
    userId: string | null;
    requestId: string | null;
    ip: string | null;
    userAgent: string | null;
    previousEventHash: string | null;
    occurredAt: Date;
    metadata: CanonicalJsonValue;
  }): string {
    const payload = JSON.stringify(
      this.normalizeValue({
        version: 1,
        streamKey: input.streamKey,
        streamSequence: input.streamSequence,
        eventType: input.eventType,
        module: input.module,
        entityId: input.entityId,
        companyId: input.companyId,
        userId: input.userId,
        requestId: input.requestId,
        ip: input.ip,
        userAgent: input.userAgent,
        previousEventHash: input.previousEventHash,
        occurredAt: input.occurredAt.toISOString(),
        metadata: input.metadata,
      }),
    );

    return createHash('sha256').update(payload).digest('hex');
  }
}
