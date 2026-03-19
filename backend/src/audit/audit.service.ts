import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { AuditAction } from './enums/audit-action.enum';

type AuditChangeObject = Record<string, unknown> & {
  before?: unknown;
  after?: unknown;
};

type AuditLogInput = {
  userId: string;
  action: AuditAction;
  entity: string;
  entityId: string;
  changes?: AuditChangeObject | string | null;
  ip: string;
  userAgent?: string;
  companyId: string;
};

const isAuditChangeObject = (value: unknown): value is AuditChangeObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
  ) {}

  async log(data: AuditLogInput): Promise<void> {
    if (!data.userId || !data.companyId) {
      throw new InternalServerErrorException(
        'AuditService: userId e companyId são obrigatórios',
      );
    }
    const now = new Date();
    const changeObject = isAuditChangeObject(data.changes)
      ? data.changes
      : null;
    const before = changeObject?.before ?? null;
    const after = changeObject?.after ?? data.changes ?? null;
    const logPayload: DeepPartial<AuditLog> = {
      ...data,
      user_id: data.userId,
      entity_type: data.entity,
      entity_id: data.entityId,
      changes: data.changes ?? undefined,
      before: before ?? undefined,
      after: after ?? undefined,
      created_at: now,
      timestamp: now,
    };
    const log = this.auditRepo.create(logPayload);
    await this.auditRepo.save(log);
  }
}
