import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Audit } from './entities/audit.entity';
import { CreateAuditDto } from './dto/create-audit.dto';
import { UpdateAuditDto } from './dto/create-audit.dto';
import {
  normalizeOffsetPagination,
  OffsetPage,
  toOffsetPage,
} from '../common/utils/offset-pagination.util';
import {
  TenantRepository,
  TenantRepositoryFactory,
} from '../common/tenant/tenant-repository';
import {
  DocumentBundleService,
  WeeklyBundleFilters,
} from '../common/services/document-bundle.service';

@Injectable()
export class AuditsService {
  private readonly logger = new Logger(AuditsService.name);
  private readonly tenantRepo: TenantRepository<Audit>;

  constructor(
    @InjectRepository(Audit)
    private auditsRepository: Repository<Audit>,
    tenantRepositoryFactory: TenantRepositoryFactory,
    private readonly documentBundleService: DocumentBundleService,
  ) {
    this.tenantRepo = tenantRepositoryFactory.wrap(this.auditsRepository);
  }

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

  async findPaginated(
    opts: { page?: number; limit?: number; search?: string },
    companyId: string,
  ): Promise<OffsetPage<Audit>> {
    const { page, limit, skip } = normalizeOffsetPagination(opts, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const qb = this.auditsRepository
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.site', 'site')
      .leftJoinAndSelect('a.auditor', 'auditor')
      .where('a.company_id = :companyId', { companyId })
      .orderBy('a.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (opts?.search) {
      qb.andWhere(
        '(a.titulo ILIKE :search OR a.tipo_auditoria ILIKE :search)',
        { search: `%${opts.search}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();
    return toOffsetPage(data, total, page, limit);
  }

  async countPendingActionItems(companyId?: string): Promise<number> {
    const params = companyId ? [companyId] : [];
    const where = companyId ? 'WHERE a.company_id = $1' : '';

    const rows = (await this.auditsRepository.query(
      `
        SELECT COALESCE(
          SUM(
            (
              SELECT COUNT(*)
              FROM json_array_elements(COALESCE(a.plano_acao, '[]'::json)) AS item
              WHERE LOWER(COALESCE(item->>'status', '')) NOT LIKE '%conclu%'
                AND LOWER(COALESCE(item->>'status', '')) NOT LIKE '%encerr%'
            )
          ),
          0
        )::int AS total
        FROM audits a
        ${where}
      `,
      params,
    )) as Array<{ total?: number | string }>;

    return Number(rows[0]?.total ?? 0);
  }

  async findOne(id: string, companyId: string) {
    const audit = await this.tenantRepo.findOne(id, companyId, {
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

  async listStoredFiles(filters: WeeklyBundleFilters) {
    const query = this.auditsRepository
      .createQueryBuilder('a')
      .where('a.pdf_file_key IS NOT NULL');

    if (filters.companyId) {
      query.andWhere('a.company_id = :companyId', {
        companyId: filters.companyId,
      });
    }

    const results = await query.getMany();

    return results
      .filter((a) => {
        if (!a.created_at) return false;
        const date = new Date(a.created_at);
        if (filters.year && date.getFullYear() !== filters.year) return false;
        if (filters.week) {
          const d = new Date(
            Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
          );
          d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
          const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
          const isoWeek = Math.ceil(
            ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
          );
          if (isoWeek !== filters.week) return false;
        }
        return true;
      })
      .map((a) => ({
        entityId: a.id,
        title: a.titulo,
        date: a.data_auditoria || a.created_at,
        id: a.id,
        titulo: a.titulo,
        companyId: a.company_id,
        fileKey: a.pdf_file_key,
        folderPath: a.pdf_folder_path,
        originalName: a.pdf_original_name,
      }));
  }

  async getWeeklyBundle(filters: WeeklyBundleFilters) {
    const files = await this.listStoredFiles(filters);
    return this.documentBundleService.buildWeeklyPdfBundle(
      'Auditoria',
      filters,
      files.map((file) => ({
        fileKey: file.fileKey,
        title: file.title,
        originalName: file.originalName,
        date: file.date,
      })),
    );
  }
}
