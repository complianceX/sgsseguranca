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
    const log = this.auditRepo.create(data);
    await this.auditRepo.save(log);
  }
}
