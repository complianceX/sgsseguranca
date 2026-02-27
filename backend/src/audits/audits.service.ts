import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Audit } from './entities/audit.entity';
import { CreateAuditDto } from './dto/create-audit.dto';
import { UpdateAuditDto } from './dto/create-audit.dto';

@Injectable()
export class AuditsService {
  private readonly logger = new Logger(AuditsService.name);

  constructor(
    @InjectRepository(Audit)
    private auditsRepository: Repository<Audit>,
  ) {}

  async create(createAuditDto: CreateAuditDto, companyId: string) {
    const audit = this.auditsRepository.create({
      ...createAuditDto,
      company_id: companyId,
    });
    const saved = await this.auditsRepository.save(audit);
    this.logger.log({
      event: 'audit_created',
      auditId: saved.id,
      companyId,
    });
    return saved;
  }

  async findAll(companyId: string) {
    return await this.auditsRepository.find({
      where: { company_id: companyId },
      relations: ['site', 'auditor'],
      order: { created_at: 'DESC' },
    });
  }

  async findOne(id: string, companyId: string) {
    const audit = await this.auditsRepository.findOne({
      where: { id, company_id: companyId },
      relations: ['site', 'auditor', 'company'],
    });

    if (!audit) {
      throw new NotFoundException(`Audit with ID ${id} not found`);
    }

    return audit;
  }

  async update(id: string, updateAuditDto: UpdateAuditDto, companyId: string) {
    const audit = await this.findOne(id, companyId);
    Object.assign(audit, updateAuditDto);
    const saved = await this.auditsRepository.save(audit);
    this.logger.log({
      event: 'audit_updated',
      auditId: saved.id,
      companyId,
    });
    return saved;
  }

  async remove(id: string, companyId: string) {
    const audit = await this.findOne(id, companyId);
    await this.auditsRepository.remove(audit);
    this.logger.log({
      event: 'audit_removed',
      auditId: audit.id,
      companyId,
    });
  }
}
