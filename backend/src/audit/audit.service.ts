import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { AuditAction } from './enums/audit-action.enum';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private auditRepo: Repository<AuditLog>,
  ) {}

  async log(data: {
    userId: string;
    action: AuditAction;
    entity: string;
    entityId: string;
    changes?: any;
    ip: string;
    userAgent?: string;
    companyId: string;
  }) {
    if (!data.userId || !data.companyId) {
      throw new InternalServerErrorException(
        'AuditService: userId e companyId são obrigatórios',
      );
    }
    const now = new Date();
    const before = data.changes?.before ?? null;
    const after = data.changes?.after ?? data.changes ?? null;
    const log = this.auditRepo.create({
      ...data,
      user_id: data.userId,
      entity_type: data.entity,
      entity_id: data.entityId,
      before,
      after,
      created_at: now,
      timestamp: now,
    });
    await this.auditRepo.save(log);
  }
}
