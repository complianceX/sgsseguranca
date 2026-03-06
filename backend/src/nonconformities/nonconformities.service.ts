import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import { NonConformity } from './entities/nonconformity.entity';
import {
  CreateNonConformityDto,
  UpdateNonConformityDto,
} from './dto/create-nonconformity.dto';
import { TenantService } from '../common/tenant/tenant.service';
import { StorageService } from '../common/services/storage.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { RequestContext } from '../common/middleware/request-context.middleware';

export enum NcStatus {
  ABERTA = 'ABERTA',
  EM_ANDAMENTO = 'EM_ANDAMENTO',
  AGUARDANDO_VALIDACAO = 'AGUARDANDO_VALIDACAO',
  ENCERRADA = 'ENCERRADA',
}

const ALLOWED_TRANSITIONS: Record<NcStatus, NcStatus[]> = {
  [NcStatus.ABERTA]: [NcStatus.EM_ANDAMENTO],
  [NcStatus.EM_ANDAMENTO]: [NcStatus.AGUARDANDO_VALIDACAO, NcStatus.ABERTA],
  [NcStatus.AGUARDANDO_VALIDACAO]: [NcStatus.ENCERRADA, NcStatus.ABERTA],
  [NcStatus.ENCERRADA]: [NcStatus.ABERTA],
};
import { format, startOfWeek, endOfWeek } from 'date-fns';

@Injectable()
export class NonConformitiesService {
  constructor(
    @InjectRepository(NonConformity)
    private nonConformitiesRepository: Repository<NonConformity>,
    private tenantService: TenantService,
    private storageService: StorageService,
    private readonly auditService: AuditService,
  ) {}

  async create(createNonConformityDto: CreateNonConformityDto) {
    const nonConformity = this.nonConformitiesRepository.create({
      ...createNonConformityDto,
      company_id: this.tenantService.getTenantId(),
    });
    const saved = await this.nonConformitiesRepository.save(nonConformity);
    await this.logAudit(AuditAction.CREATE, saved.id, null, saved);
    return saved;
  }

  async findAll() {
    const tenantId = this.tenantService.getTenantId();
    return this.nonConformitiesRepository.find({
      where: tenantId ? { company_id: tenantId } : {},
      relations: ['site'],
      order: { created_at: 'DESC' },
    });
  }

  async findOne(id: string) {
    const tenantId = this.tenantService.getTenantId();
    const nonConformity = await this.nonConformitiesRepository.findOne({
      where: tenantId ? { id, company_id: tenantId } : { id },
      relations: ['site', 'company'],
    });

    if (!nonConformity) {
      throw new NotFoundException(
        `Não conformidade com ID ${id} não encontrada`,
      );
    }

    return nonConformity;
  }

  async update(id: string, updateNonConformityDto: UpdateNonConformityDto) {
    const nonConformity = await this.findOne(id);
    const before = { ...nonConformity };
    Object.assign(nonConformity, updateNonConformityDto);
    const saved = await this.nonConformitiesRepository.save(nonConformity);
    await this.logAudit(AuditAction.UPDATE, saved.id, before, saved);
    return saved;
  }

  async remove(id: string) {
    const nonConformity = await this.findOne(id);
    const before = { ...nonConformity };
    await this.nonConformitiesRepository.remove(nonConformity);
    await this.logAudit(AuditAction.DELETE, id, before, null);
  }

  async listStoredFiles(filters: {
    companyId?: string;
    year?: number;
    week?: number;
  }) {
    const tenantId = this.tenantService.getTenantId();
    const query = this.nonConformitiesRepository
      .createQueryBuilder('nc')
      .where('nc.pdf_file_key IS NOT NULL');

    if (tenantId) {
      query.andWhere('nc.company_id = :tenantId', { tenantId });
    }

    if (filters.companyId) {
      query.andWhere('nc.company_id = :companyId', {
        companyId: filters.companyId,
      });
    }

    const results = await query.getMany();

    // Filtragem por ano e semana (se fornecido)
    return results
      .filter((nc) => {
        if (!nc.created_at) return false;
        const date = new Date(nc.created_at);
        if (filters.year && date.getFullYear() !== filters.year) return false;
        if (filters.week) {
          const ncWeek = parseInt(format(date, 'I')); // ISO week
          if (ncWeek !== filters.week) return false;
        }
        return true;
      })
      .map((nc) => ({
        id: nc.id,
        codigo_nc: nc.codigo_nc,
        data_identificacao: nc.data_identificacao,
        companyId: nc.company_id,
        fileKey: nc.pdf_file_key,
        folderPath: nc.pdf_folder_path,
        originalName: nc.pdf_original_name,
      }));
  }

  async getPdfAccess(id: string) {
    const nc = await this.findOne(id);
    if (!nc.pdf_file_key) {
      throw new NotFoundException('Arquivo PDF não encontrado para esta NC');
    }

    const url = await this.storageService.getPresignedDownloadUrl(
      nc.pdf_file_key,
    );
    return {
      entityId: nc.id,
      fileKey: nc.pdf_file_key,
      folderPath: nc.pdf_folder_path,
      originalName: nc.pdf_original_name,
      url,
    };
  }

  async attachPdf(
    id: string,
    buffer: Buffer,
    originalName: string,
    mimetype: string,
  ) {
    const nc = await this.findOne(id);
    const date = new Date();
    const year = date.getFullYear();
    const week = format(date, 'I');
    const folderPath = `nonconformities/${nc.company_id}/${year}/week-${week}`;
    const fileKey = `${folderPath}/${id}.pdf`;

    await this.storageService.uploadFile(fileKey, buffer, mimetype);

    nc.pdf_file_key = fileKey;
    nc.pdf_folder_path = folderPath;
    nc.pdf_original_name = originalName;

    return this.nonConformitiesRepository.save(nc);
  }

  async getMonthlyAnalytics(): Promise<{ mes: string; total: number }[]> {
    const tenantId = this.tenantService.getTenantId();
    const qb = this.nonConformitiesRepository
      .createQueryBuilder('nc')
      .select("TO_CHAR(DATE_TRUNC('month', nc.created_at), 'YYYY-MM')", 'mes')
      .addSelect('COUNT(*)', 'total')
      .where("nc.created_at >= NOW() - INTERVAL '12 months'")
      .groupBy("DATE_TRUNC('month', nc.created_at)")
      .orderBy("DATE_TRUNC('month', nc.created_at)", 'ASC');

    if (tenantId) {
      qb.andWhere('nc.company_id = :tenantId', { tenantId });
    }

    const rows = await qb.getRawMany<{ mes: string; total: string }>();
    return rows.map((r) => ({ mes: r.mes, total: Number(r.total) }));
  }

  async updateStatus(id: string, newStatus: NcStatus): Promise<NonConformity> {
    const nc = await this.findOne(id);
    const before = { ...nc };
    const current = nc.status as NcStatus;
    const allowed = ALLOWED_TRANSITIONS[current] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Transição de "${current}" para "${newStatus}" não permitida`,
      );
    }
    nc.status = newStatus;
    const saved = await this.nonConformitiesRepository.save(nc);
    await this.logAudit(AuditAction.UPDATE, saved.id, before, saved);
    return saved;
  }

  async count(options?: any): Promise<number> {
    return this.nonConformitiesRepository.count(options);
  }

  async exportExcel(): Promise<Buffer> {
    const tenantId = this.tenantService.getTenantId();
    const qb = this.nonConformitiesRepository
      .createQueryBuilder('nc')
      .select([
        'nc.codigo_nc', 'nc.tipo', 'nc.status',
        'nc.data_identificacao', 'nc.created_at',
      ])
      .orderBy('nc.created_at', 'DESC');
    if (tenantId) qb.where('nc.company_id = :tenantId', { tenantId });
    const ncs = await qb.getMany();

    const rows = ncs.map((n) => ({
      'Código NC': n.codigo_nc,
      'Tipo': n.tipo ?? '',
      'Status': n.status,
      'Data de Identificação': n.data_identificacao
        ? new Date(n.data_identificacao).toLocaleDateString('pt-BR')
        : '',
      'Criado em': new Date(n.created_at).toLocaleDateString('pt-BR'),
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Não Conformidades');
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }

  private async logAudit(
    action: AuditAction,
    entityId: string,
    before: unknown,
    after: unknown,
  ) {
    const companyId = this.tenantService.getTenantId();
    if (!companyId) return;
    await this.auditService.log({
      userId: RequestContext.getUserId() || 'system',
      action,
      entity: 'NonConformity',
      entityId,
      changes: { before, after },
      ip: (RequestContext.get('ip') as string) || 'unknown',
      userAgent: (RequestContext.get('userAgent') as string) || 'unknown',
      companyId,
    });
  }
}
