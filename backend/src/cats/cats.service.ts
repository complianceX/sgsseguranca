import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import * as path from 'path';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { StorageService } from '../common/services/storage.service';
import { TenantService } from '../common/tenant/tenant.service';
import {
  normalizeOffsetPagination,
  toOffsetPage,
} from '../common/utils/offset-pagination.util';
import { User } from '../users/entities/user.entity';
import { CloseCatDto } from './dto/close-cat.dto';
import { CreateCatDto } from './dto/create-cat.dto';
import { StartCatInvestigationDto } from './dto/start-cat-investigation.dto';
import { UpdateCatDto } from './dto/update-cat.dto';
import {
  Cat,
  CatAttachment,
  CatAttachmentCategory,
  CatStatus,
} from './entities/cat.entity';

@Injectable()
export class CatsService {
  constructor(
    @InjectRepository(Cat)
    private readonly catsRepository: Repository<Cat>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly tenantService: TenantService,
    private readonly storageService: StorageService,
    private readonly auditService: AuditService,
  ) {}

  async create(createDto: CreateCatDto, actorId?: string): Promise<Cat> {
    const companyId = this.getTenantIdOrThrow();
    const numero =
      createDto.numero || (await this.generateCatNumber(companyId));

    const cat = this.catsRepository.create({
      ...createDto,
      numero,
      company_id: companyId,
      data_ocorrencia: new Date(createDto.data_ocorrencia),
      tipo: createDto.tipo || 'tipico',
      gravidade: createDto.gravidade || 'moderada',
      status: 'aberta',
      opened_by_id: actorId,
      opened_at: new Date(),
    });

    const saved = await this.catsRepository.save(cat);
    await this.writeAuditLog(AuditAction.CREATE, saved, actorId, {
      event: 'cat_opened',
      companyId,
      status: saved.status,
    });
    return saved;
  }

  async findAll(filters?: {
    status?: CatStatus;
    worker_id?: string;
    site_id?: string;
  }): Promise<Cat[]> {
    const page = await this.findPaginated({
      ...filters,
      page: 1,
      limit: 100,
    });
    return page.data;
  }

  async findPaginated(filters?: {
    status?: CatStatus;
    worker_id?: string;
    site_id?: string;
    page?: number;
    limit?: number;
  }) {
    const companyId = this.getTenantIdOrThrow();
    const { page, limit, skip } = normalizeOffsetPagination(filters, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const query = this.catsRepository
      .createQueryBuilder('cat')
      .leftJoinAndSelect('cat.site', 'site')
      .leftJoinAndSelect('cat.worker', 'worker')
      .leftJoinAndSelect('cat.opened_by', 'opened_by')
      .leftJoinAndSelect('cat.investigated_by', 'investigated_by')
      .leftJoinAndSelect('cat.closed_by', 'closed_by')
      .where('cat.company_id = :companyId', { companyId })
      .orderBy('cat.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (filters?.status) {
      query.andWhere('cat.status = :status', { status: filters.status });
    }

    if (filters?.worker_id) {
      query.andWhere('cat.worker_id = :workerId', {
        workerId: filters.worker_id,
      });
    }

    if (filters?.site_id) {
      query.andWhere('cat.site_id = :siteId', { siteId: filters.site_id });
    }

    const [data, total] = await query.getManyAndCount();
    return toOffsetPage(data, total, page, limit);
  }

  async findOne(id: string): Promise<Cat> {
    const companyId = this.getTenantIdOrThrow();
    const cat = await this.catsRepository.findOne({
      where: { id, company_id: companyId },
      relations: [
        'site',
        'worker',
        'opened_by',
        'investigated_by',
        'closed_by',
      ],
    });

    if (!cat) {
      throw new NotFoundException(`CAT com ID ${id} não encontrada`);
    }

    return cat;
  }

  async update(
    id: string,
    updateDto: UpdateCatDto,
    actorId?: string,
  ): Promise<Cat> {
    const cat = await this.findOne(id);
    if (cat.status === 'fechada') {
      throw new BadRequestException(
        'CAT fechada não pode ser alterada por atualização genérica.',
      );
    }

    Object.assign(cat, {
      ...updateDto,
      ...(updateDto.data_ocorrencia
        ? { data_ocorrencia: new Date(updateDto.data_ocorrencia) }
        : {}),
    });

    const saved = await this.catsRepository.save(cat);
    await this.writeAuditLog(AuditAction.UPDATE, saved, actorId, {
      event: 'cat_updated',
      companyId: saved.company_id,
      status: saved.status,
      fields: Object.keys(updateDto),
    });
    return saved;
  }

  async startInvestigation(
    id: string,
    dto: StartCatInvestigationDto,
    actorId?: string,
  ): Promise<Cat> {
    const cat = await this.findOne(id);
    if (cat.status === 'fechada') {
      throw new BadRequestException(
        'CAT já está fechada e não pode voltar para investigação.',
      );
    }

    cat.status = 'investigacao';
    cat.investigacao_detalhes = dto.investigacao_detalhes;
    cat.causa_raiz = dto.causa_raiz || cat.causa_raiz;
    cat.acao_imediata = dto.acao_imediata || cat.acao_imediata;
    cat.investigated_by_id = actorId;
    cat.investigated_at = new Date();

    const saved = await this.catsRepository.save(cat);
    await this.writeAuditLog(AuditAction.UPDATE, saved, actorId, {
      event: 'cat_investigation_started',
      companyId: saved.company_id,
      status: saved.status,
    });
    return saved;
  }

  async close(id: string, dto: CloseCatDto, actorId?: string): Promise<Cat> {
    const cat = await this.findOne(id);
    if (cat.status === 'fechada') {
      throw new BadRequestException('CAT já está fechada.');
    }

    cat.status = 'fechada';
    cat.plano_acao_fechamento = dto.plano_acao_fechamento;
    cat.licoes_aprendidas = dto.licoes_aprendidas || cat.licoes_aprendidas;
    cat.causa_raiz = dto.causa_raiz || cat.causa_raiz;
    cat.closed_by_id = actorId;
    cat.closed_at = new Date();

    const saved = await this.catsRepository.save(cat);
    await this.writeAuditLog(AuditAction.UPDATE, saved, actorId, {
      event: 'cat_closed',
      companyId: saved.company_id,
      status: saved.status,
    });
    return saved;
  }

  async addAttachment(
    id: string,
    input: {
      fileBuffer: Buffer;
      originalName?: string;
      mimeType?: string;
      category?: CatAttachmentCategory;
    },
    actorId?: string,
  ): Promise<CatAttachment> {
    if (!input.fileBuffer?.length) {
      throw new BadRequestException('Arquivo de anexo não enviado.');
    }

    const cat = await this.findOne(id);
    const timestamp = new Date();
    const safeName = this.sanitizeFilename(
      input.originalName || `cat-anexo-${Date.now()}.bin`,
    );
    const folder = path.posix.join(
      'cats',
      cat.company_id,
      String(timestamp.getUTCFullYear()),
      String(timestamp.getUTCMonth() + 1).padStart(2, '0'),
    );
    const fileHash = createHash('sha256')
      .update(input.fileBuffer)
      .digest('hex');
    const fileKey = path.posix.join(
      folder,
      `${cat.id}-${Date.now()}-${fileHash.slice(0, 12)}-${safeName}`,
    );

    await this.storageService.uploadFile(
      fileKey,
      input.fileBuffer,
      input.mimeType || 'application/octet-stream',
    );

    const attachment: CatAttachment = {
      id: randomUUID(),
      file_name: safeName,
      file_key: fileKey,
      file_type: input.mimeType || 'application/octet-stream',
      category: input.category || 'geral',
      uploaded_by_id: actorId,
      uploaded_at: timestamp,
    };

    cat.attachments = [...(cat.attachments || []), attachment];
    await this.catsRepository.save(cat);
    await this.writeAuditLog(AuditAction.UPDATE, cat, actorId, {
      event: 'cat_attachment_added',
      companyId: cat.company_id,
      attachmentId: attachment.id,
      category: attachment.category,
    });

    return attachment;
  }

  async removeAttachment(
    id: string,
    attachmentId: string,
    actorId?: string,
  ): Promise<void> {
    const cat = await this.findOne(id);
    const current = cat.attachments || [];
    const exists = current.some((item) => item.id === attachmentId);
    if (!exists) {
      throw new NotFoundException('Anexo não encontrado para esta CAT.');
    }

    cat.attachments = current.filter((item) => item.id !== attachmentId);
    await this.catsRepository.save(cat);
    await this.writeAuditLog(AuditAction.UPDATE, cat, actorId, {
      event: 'cat_attachment_removed',
      companyId: cat.company_id,
      attachmentId,
    });
  }

  async getAttachmentAccess(
    id: string,
    attachmentId: string,
  ): Promise<{
    attachmentId: string;
    fileName: string;
    fileType: string;
    url: string;
  }> {
    const cat = await this.findOne(id);
    const attachment = (cat.attachments || []).find(
      (item) => item.id === attachmentId,
    );
    if (!attachment) {
      throw new NotFoundException('Anexo não encontrado para esta CAT.');
    }

    const url = await this.storageService.getPresignedDownloadUrl(
      attachment.file_key,
    );
    return {
      attachmentId: attachment.id,
      fileName: attachment.file_name,
      fileType: attachment.file_type,
      url,
    };
  }

  async getSummary() {
    const companyId = this.getTenantIdOrThrow();
    const [total, abertas, investigacao, fechadas] = await Promise.all([
      this.catsRepository.count({ where: { company_id: companyId } }),
      this.catsRepository.count({
        where: { company_id: companyId, status: 'aberta' },
      }),
      this.catsRepository.count({
        where: { company_id: companyId, status: 'investigacao' },
      }),
      this.catsRepository.count({
        where: { company_id: companyId, status: 'fechada' },
      }),
    ]);

    const bySeverityRaw = await this.catsRepository
      .createQueryBuilder('cat')
      .select('cat.gravidade', 'gravidade')
      .addSelect('COUNT(*)', 'total')
      .where('cat.company_id = :companyId', { companyId })
      .groupBy('cat.gravidade')
      .getRawMany<{ gravidade: string; total: string }>();

    const bySeverity = bySeverityRaw.reduce<Record<string, number>>(
      (acc, row) => {
        acc[row.gravidade] = Number(row.total);
        return acc;
      },
      {},
    );

    return {
      total,
      aberta: abertas,
      investigacao,
      fechada: fechadas,
      bySeverity,
    };
  }

  async getStatistics() {
    const companyId = this.getTenantIdOrThrow();

    const [
      total,
      fatalCount,
      openCount,
      byTipoRaw,
      byGravidadeRaw,
      byMonthRaw,
    ] = await Promise.all([
      this.catsRepository.count({ where: { company_id: companyId } }),
      this.catsRepository.count({
        where: { company_id: companyId, gravidade: 'fatal' },
      }),
      this.catsRepository.count({
        where: { company_id: companyId, status: 'aberta' },
      }),
      this.catsRepository
        .createQueryBuilder('cat')
        .select('cat.tipo', 'tipo')
        .addSelect('COUNT(*)', 'total')
        .where('cat.company_id = :companyId', { companyId })
        .groupBy('cat.tipo')
        .getRawMany<{ tipo: string; total: string }>(),
      this.catsRepository
        .createQueryBuilder('cat')
        .select('cat.gravidade', 'gravidade')
        .addSelect('COUNT(*)', 'total')
        .where('cat.company_id = :companyId', { companyId })
        .groupBy('cat.gravidade')
        .getRawMany<{ gravidade: string; total: string }>(),
      this.catsRepository
        .createQueryBuilder('cat')
        .select("DATE_TRUNC('month', cat.data_ocorrencia)", 'month')
        .addSelect('COUNT(*)', 'total')
        .where('cat.company_id = :companyId', { companyId })
        .andWhere("cat.data_ocorrencia >= NOW() - INTERVAL '12 months'")
        .groupBy("DATE_TRUNC('month', cat.data_ocorrencia)")
        .orderBy("DATE_TRUNC('month', cat.data_ocorrencia)", 'ASC')
        .getRawMany<{ month: string; total: string }>(),
    ]);

    const byTipo = byTipoRaw.reduce<Record<string, number>>((acc, r) => {
      acc[r.tipo] = Number(r.total);
      return acc;
    }, {});

    const byGravidade = byGravidadeRaw.reduce<Record<string, number>>(
      (acc, r) => {
        acc[r.gravidade] = Number(r.total);
        return acc;
      },
      {},
    );

    const byMonth = byMonthRaw.map((r) => ({
      month: r.month ? new Date(r.month).toISOString().slice(0, 7) : '',
      total: Number(r.total),
    }));

    return { total, fatalCount, openCount, byTipo, byGravidade, byMonth };
  }

  private getTenantIdOrThrow(): string {
    const tenantId = this.tenantService.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Contexto de empresa não definido.');
    }
    return tenantId;
  }

  private async generateCatNumber(companyId: string): Promise<string> {
    const now = new Date();
    const datePart = `${now.getUTCFullYear()}${String(
      now.getUTCMonth() + 1,
    ).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
    const prefix = `CAT-${datePart}-`;
    const totalToday = await this.catsRepository
      .createQueryBuilder('cat')
      .where('cat.company_id = :companyId', { companyId })
      .andWhere('cat.numero LIKE :prefix', { prefix: `${prefix}%` })
      .getCount();
    return `${prefix}${String(totalToday + 1).padStart(4, '0')}`;
  }

  private sanitizeFilename(name: string): string {
    const base = path.basename(name);
    return base
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 140);
  }

  private async writeAuditLog(
    action: AuditAction,
    cat: Cat,
    userId?: string,
    metadata?: Record<string, unknown>,
  ) {
    const actorId = userId || '';
    await this.auditService.log({
      userId: actorId,
      action,
      entity: 'CAT',
      entityId: cat.id,
      changes: JSON.stringify(metadata),
      ip: '0.0.0.0',
      companyId: cat.company_id,
    });
  }
}
