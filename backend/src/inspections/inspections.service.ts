import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { plainToClass } from 'class-transformer';
import { Inspection } from './entities/inspection.entity';
import { InspectionResponseDto } from './dto/inspection-response.dto';
import {
  CreateInspectionDto,
  UpdateInspectionDto,
} from './dto/create-inspection.dto';

import { NotificationsGateway } from '../notifications/notifications.gateway';
import { TenantService } from '../common/tenant/tenant.service';
import { Site } from '../sites/entities/site.entity';
import { User } from '../users/entities/user.entity';
import {
  TenantRepository,
  TenantRepositoryFactory,
} from '../common/tenant/tenant-repository';
import {
  normalizeOffsetPagination,
  OffsetPage,
  toOffsetPage,
} from '../common/utils/offset-pagination.util';
import { S3Service } from '../common/storage/s3.service';
import { WeeklyBundleFilters } from '../common/services/document-bundle.service';
import { DocumentStorageService } from '../common/services/document-storage.service';
import { cleanupUploadedFile } from '../common/storage/storage-compensation.util';
import { DocumentGovernanceService } from '../document-registry/document-governance.service';
import { DocumentRegistryService } from '../document-registry/document-registry.service';
import { RequestContext } from '../common/middleware/request-context.middleware';
import { getIsoWeekNumber } from '../common/utils/document-calendar.util';
import { createReadStream } from 'fs';
import { readFile } from 'fs/promises';
import { getInspectionInlineEvidenceMaxBytes } from '../common/services/pdf-runtime-config';

export type InspectionPdfAccessAvailability =
  | 'ready'
  | 'registered_without_signed_url'
  | 'not_emitted';

export type InspectionPdfAccessResponse = {
  entityId: string;
  hasFinalPdf: boolean;
  availability: InspectionPdfAccessAvailability;
  fileKey: string | null;
  folderPath: string | null;
  originalName: string | null;
  url: string | null;
  message: string | null;
};

export type InspectionEvidenceAttachResponse = {
  evidencias: Inspection['evidencias'];
  storageMode: 's3' | 'inline-fallback';
  degraded: boolean;
  message: string | null;
};

@Injectable()
export class InspectionsService {
  private readonly logger = new Logger(InspectionsService.name);
  private readonly tenantRepo: TenantRepository<Inspection>;

  constructor(
    @InjectRepository(Inspection)
    private inspectionsRepository: Repository<Inspection>,
    @InjectRepository(Site)
    private sitesRepository: Repository<Site>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private notificationsGateway: NotificationsGateway,
    private tenantService: TenantService,
    tenantRepositoryFactory: TenantRepositoryFactory,
    private readonly s3Service: S3Service,
    private readonly documentStorageService: DocumentStorageService,
    private readonly documentGovernanceService: DocumentGovernanceService,
    private readonly documentRegistryService: DocumentRegistryService,
  ) {
    this.tenantRepo = tenantRepositoryFactory.wrap(this.inspectionsRepository);
  }

  private normalizeText(value?: string | null): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private normalizeRequiredText(value: string): string {
    return value.trim();
  }

  private normalizeStringArray(values?: string[]): string[] {
    return Array.from(
      new Set((values ?? []).map((value) => value.trim()).filter(Boolean)),
    );
  }

  private countInlineEvidence(
    evidencias?: Inspection['evidencias'] | CreateInspectionDto['evidencias'],
  ): number {
    return (evidencias ?? []).filter(
      (item) => typeof item.url === 'string' && item.url.startsWith('data:'),
    ).length;
  }

  private logInspectionEvent(
    level: 'log' | 'warn' | 'debug',
    event: string,
    payload: Record<string, unknown>,
  ): void {
    const loggerPayload = {
      event,
      userId: RequestContext.getUserId() || undefined,
      ...payload,
    };

    if (level === 'warn') {
      this.logger.warn(loggerPayload);
      return;
    }

    if (level === 'debug') {
      this.logger.debug(loggerPayload);
      return;
    }

    this.logger.log(loggerPayload);
  }

  private getInlineEvidencePayloadBytes(dataUrl: string): number | null {
    const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
    if (!match) {
      return null;
    }

    const base64Payload = match[2].replace(/\s+/g, '');
    if (!base64Payload) {
      return 0;
    }

    const padding = base64Payload.endsWith('==')
      ? 2
      : base64Payload.endsWith('=')
        ? 1
        : 0;

    return Math.max(0, Math.floor((base64Payload.length * 3) / 4) - padding);
  }

  private normalizeEvidenceUrl(value?: string | null): string | undefined {
    const normalized = this.normalizeText(value) || undefined;
    if (!normalized || !normalized.startsWith('data:')) {
      return normalized;
    }

    const payloadBytes = this.getInlineEvidencePayloadBytes(normalized);
    if (payloadBytes === null) {
      throw new BadRequestException('Evidência inline inválida.');
    }

    const maxInlineEvidenceBytes = getInspectionInlineEvidenceMaxBytes();
    if (payloadBytes > maxInlineEvidenceBytes) {
      throw new BadRequestException(
        `Evidência inline excede o limite de ${(maxInlineEvidenceBytes / 1024 / 1024).toFixed(2)}MB para criação ou edição.`,
      );
    }

    return normalized;
  }

  private normalizePerigosRiscos(
    values?: CreateInspectionDto['perigos_riscos'],
  ): Inspection['perigos_riscos'] {
    return (values ?? [])
      .map((item) => ({
        grupo_risco: this.normalizeRequiredText(item.grupo_risco),
        perigo_fator_risco: this.normalizeRequiredText(item.perigo_fator_risco),
        fonte_circunstancia: this.normalizeRequiredText(
          item.fonte_circunstancia,
        ),
        trabalhadores_expostos: this.normalizeRequiredText(
          item.trabalhadores_expostos,
        ),
        tipo_exposicao: this.normalizeRequiredText(item.tipo_exposicao),
        medidas_existentes: this.normalizeRequiredText(item.medidas_existentes),
        severidade: this.normalizeRequiredText(item.severidade),
        probabilidade: this.normalizeRequiredText(item.probabilidade),
        nivel_risco: this.normalizeRequiredText(item.nivel_risco),
        classificacao_risco: this.normalizeRequiredText(
          item.classificacao_risco,
        ),
        acoes_necessarias: this.normalizeRequiredText(item.acoes_necessarias),
        prazo: this.normalizeRequiredText(item.prazo),
        responsavel: this.normalizeRequiredText(item.responsavel),
      }))
      .filter(
        (item) =>
          item.grupo_risco ||
          item.perigo_fator_risco ||
          item.acoes_necessarias ||
          item.responsavel,
      );
  }

  private normalizePlanoAcao(
    values?: CreateInspectionDto['plano_acao'],
  ): Inspection['plano_acao'] {
    return (values ?? [])
      .map((item) => ({
        acao: this.normalizeRequiredText(item.acao),
        responsavel: this.normalizeRequiredText(item.responsavel),
        prazo: this.normalizeRequiredText(item.prazo),
        status: this.normalizeText(item.status) || 'Pendente',
      }))
      .filter((item) => item.acao || item.responsavel || item.prazo);
  }

  private normalizeEvidencias(
    values?: CreateInspectionDto['evidencias'],
  ): Inspection['evidencias'] {
    return (values ?? [])
      .map((item) => {
        const evidenceWithOriginalName = item as { original_name?: string };
        return {
          descricao: this.normalizeRequiredText(item.descricao),
          url: this.normalizeEvidenceUrl(item.url),
          original_name:
            this.normalizeText(evidenceWithOriginalName.original_name) ||
            undefined,
        };
      })
      .filter((item) => item.descricao || item.url);
  }

  private async signEvidenceUrls(evidencias: Inspection['evidencias']): Promise<
    | {
        descricao: string;
        url?: string;
        original_name?: string;
      }[]
    | null
  > {
    if (!evidencias || evidencias.length === 0) return evidencias ?? null;
    const mapped = await Promise.all(
      evidencias.map(async (ev) => {
        if (!ev.url) return ev;
        const isHttp =
          ev.url.startsWith('http://') || ev.url.startsWith('https://');
        let signed = ev.url;
        if (!isHttp) {
          try {
            signed = await this.s3Service.getSignedUrl(ev.url, 3600);
          } catch (err) {
            this.logger.warn(
              `Não foi possível assinar URL da evidência (${ev.url}): ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          }
        }
        return { ...ev, url: signed };
      }),
    );
    return mapped;
  }

  private buildCreatePayload(
    dto: CreateInspectionDto,
    companyId: string,
  ): Partial<Inspection> {
    return {
      company_id: companyId,
      site_id: dto.site_id,
      setor_area: this.normalizeRequiredText(dto.setor_area),
      tipo_inspecao: this.normalizeRequiredText(dto.tipo_inspecao),
      data_inspecao: dto.data_inspecao as unknown as Date,
      horario: this.normalizeRequiredText(dto.horario),
      responsavel_id: dto.responsavel_id,
      objetivo: this.normalizeText(dto.objetivo),
      descricao_local_atividades: this.normalizeText(
        dto.descricao_local_atividades,
      ),
      metodologia: this.normalizeStringArray(dto.metodologia),
      perigos_riscos: this.normalizePerigosRiscos(dto.perigos_riscos),
      plano_acao: this.normalizePlanoAcao(dto.plano_acao),
      evidencias: this.normalizeEvidencias(dto.evidencias),
      conclusao: this.normalizeText(dto.conclusao),
    };
  }

  private buildUpdatePayload(dto: UpdateInspectionDto): Partial<Inspection> {
    const payload: Partial<Inspection> = {};

    if (dto.site_id !== undefined) payload.site_id = dto.site_id;
    if (dto.setor_area !== undefined) {
      payload.setor_area = this.normalizeRequiredText(dto.setor_area);
    }
    if (dto.tipo_inspecao !== undefined) {
      payload.tipo_inspecao = this.normalizeRequiredText(dto.tipo_inspecao);
    }
    if (dto.data_inspecao !== undefined) {
      payload.data_inspecao = dto.data_inspecao as unknown as Date;
    }
    if (dto.horario !== undefined) {
      payload.horario = this.normalizeRequiredText(dto.horario);
    }
    if (dto.responsavel_id !== undefined)
      payload.responsavel_id = dto.responsavel_id;
    if (dto.objetivo !== undefined)
      payload.objetivo = this.normalizeText(dto.objetivo);
    if (dto.descricao_local_atividades !== undefined) {
      payload.descricao_local_atividades = this.normalizeText(
        dto.descricao_local_atividades,
      );
    }
    if (dto.metodologia !== undefined) {
      payload.metodologia = this.normalizeStringArray(dto.metodologia);
    }
    if (dto.perigos_riscos !== undefined) {
      payload.perigos_riscos = this.normalizePerigosRiscos(dto.perigos_riscos);
    }
    if (dto.plano_acao !== undefined) {
      payload.plano_acao = this.normalizePlanoAcao(dto.plano_acao);
    }
    if (dto.evidencias !== undefined) {
      payload.evidencias = this.normalizeEvidencias(dto.evidencias);
    }
    if (dto.conclusao !== undefined)
      payload.conclusao = this.normalizeText(dto.conclusao);

    return payload;
  }

  private async validateLinkedRecords(
    payload: Partial<Inspection>,
    companyId: string,
  ): Promise<void> {
    if (payload.site_id) {
      const site = await this.sitesRepository.findOne({
        where: { id: payload.site_id, company_id: companyId, status: true },
      });
      if (!site) {
        throw new BadRequestException(
          'O site informado não pertence à empresa selecionada.',
        );
      }
    }

    if (payload.responsavel_id) {
      const responsavel = await this.usersRepository.findOne({
        where: {
          id: payload.responsavel_id,
          company_id: companyId,
          status: true,
          deletedAt: IsNull(),
        },
      });
      if (!responsavel) {
        throw new BadRequestException(
          'O responsável informado não está ativo ou não pertence à empresa selecionada.',
        );
      }
    }
  }

  async create(
    createInspectionDto: CreateInspectionDto,
    companyId: string,
  ): Promise<InspectionResponseDto> {
    const payload = this.buildCreatePayload(createInspectionDto, companyId);
    await this.validateLinkedRecords(payload, companyId);

    const inspection = this.inspectionsRepository.create(payload);
    const saved = await this.inspectionsRepository.save(inspection);
    const inlineEvidenceCount = this.countInlineEvidence(payload.evidencias);

    // Notificar em tempo real
    try {
      // Notificar usuário (ex: admin ou quem criou se fosse passado)
      // Como não temos userId aqui, vamos notificar a empresa
      this.notificationsGateway.sendToCompany(companyId, 'inspection:created', {
        id: saved.id,
        message: 'Nova inspeção foi criada',
      });

      // Exemplo de notificar usuário específico se tivéssemos o ID
      // const currentUserId = this.tenantService.getTenantId(); // tenantId costuma ser companyId, mas se fosse userId...
      // assumindo que podemos pegar o usuário atual via request context se injetado, mas aqui vamos manter simples
    } catch (error) {
      this.logger.error('Falha ao enviar notificação de inspeção', error);
    }

    this.logInspectionEvent('log', 'inspection_created', {
      inspectionId: saved.id,
      companyId,
      riskCount: payload.perigos_riscos?.length || 0,
      actionCount: payload.plano_acao?.length || 0,
      evidenceCount: payload.evidencias?.length || 0,
      inlineEvidenceCount,
      degradedInlineEvidence: inlineEvidenceCount > 0,
    });

    return plainToClass(InspectionResponseDto, saved);
  }

  async findAll(companyId: string): Promise<InspectionResponseDto[]> {
    const inspections = await this.inspectionsRepository.find({
      where: { company_id: companyId },
      relations: ['site', 'responsavel'],
      order: { created_at: 'DESC' },
    });
    return inspections.map((i) => plainToClass(InspectionResponseDto, i));
  }

  async findPaginated(
    companyId: string,
    opts?: {
      page?: number;
      limit?: number;
      search?: string;
    },
  ): Promise<OffsetPage<InspectionResponseDto>> {
    const { page, limit, skip } = normalizeOffsetPagination(opts, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const query = this.inspectionsRepository
      .createQueryBuilder('inspection')
      .leftJoinAndSelect('inspection.site', 'site')
      .leftJoinAndSelect('inspection.responsavel', 'responsavel')
      .where('inspection.company_id = :companyId', { companyId })
      .orderBy('inspection.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (opts?.search?.trim()) {
      const search = `%${opts.search.trim().toLowerCase()}%`;
      query.andWhere(
        `(
          LOWER(inspection.setor_area) LIKE :search
          OR LOWER(inspection.tipo_inspecao) LIKE :search
          OR LOWER(COALESCE(site.nome, '')) LIKE :search
          OR LOWER(COALESCE(responsavel.nome, '')) LIKE :search
        )`,
        { search },
      );
    }

    const [data, total] = await query.getManyAndCount();
    return toOffsetPage(
      data.map((item) => plainToClass(InspectionResponseDto, item)),
      total,
      page,
      limit,
    );
  }

  async countPendingActionItems(companyId?: string): Promise<number> {
    const resolvedCompanyId = companyId || this.tenantService.getTenantId();
    if (!resolvedCompanyId) {
      throw new BadRequestException(
        'Contexto de empresa obrigatório para contabilizar ações pendentes.',
      );
    }
    const params = [resolvedCompanyId];
    const where = 'WHERE i.company_id = $1';

    const rows: unknown = await this.inspectionsRepository.query(
      `
        SELECT COALESCE(
          SUM(
            (
              SELECT COUNT(*)
              FROM json_array_elements(COALESCE(i.plano_acao, '[]'::json)) AS item
              WHERE LOWER(COALESCE(item->>'status', '')) NOT LIKE '%conclu%'
                AND LOWER(COALESCE(item->>'status', '')) NOT LIKE '%encerr%'
            )
          ),
          0
        )::int AS total
        FROM inspections i
        ${where}
      `,
      params,
    );

    const firstRow =
      Array.isArray(rows) && rows[0] && typeof rows[0] === 'object'
        ? (rows[0] as Record<string, unknown>)
        : undefined;
    const total = firstRow?.total;

    return Number(
      typeof total === 'number' || typeof total === 'string' ? total : 0,
    );
  }

  async findOne(id: string, companyId: string): Promise<InspectionResponseDto> {
    const inspection = await this.findOneEntity(id, companyId);
    const evidencias = await this.signEvidenceUrls(inspection.evidencias);
    return plainToClass(InspectionResponseDto, { ...inspection, evidencias });
  }

  private buildValidationCode(inspection: Inspection): string {
    const prefix = 'INS';
    const documentDate = inspection.data_inspecao
      ? new Date(inspection.data_inspecao)
      : null;
    const year =
      documentDate && !Number.isNaN(documentDate.getTime())
        ? documentDate.getFullYear()
        : new Date().getFullYear();
    const ref = (inspection.id || inspection.tipo_inspecao || 'INS')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(-8)
      .toUpperCase();
    return `${prefix}-${year}-${ref}`;
  }

  async validateByCode(code: string) {
    const normalized = code.trim().toUpperCase();
    if (!normalized.startsWith('INS-')) {
      return { valid: false, message: 'Código inválido para inspeção.' };
    }

    const registryEntry =
      await this.documentRegistryService.findByCode(normalized);

    if (!registryEntry || registryEntry.module !== 'inspection') {
      return {
        valid: false,
        message:
          'Relatório de inspeção não encontrado ou ainda não foi emitido como documento final.',
      };
    }

    const match = await this.inspectionsRepository.findOne({
      where: { id: registryEntry.entity_id },
    });

    if (!match) {
      return {
        valid: false,
        message: 'Registro de inspeção não localizado para o código informado.',
      };
    }

    return {
      valid: true,
      code: normalized,
      inspection: {
        id: match.id,
        site_id: match.site_id,
        setor_area: match.setor_area,
        tipo_inspecao: match.tipo_inspecao,
        data_inspecao: match.data_inspecao,
        responsavel_id: match.responsavel_id,
        updated_at: match.updated_at,
      },
    };
  }

  private guessContentType(filename?: string): string {
    if (!filename) return 'application/octet-stream';
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'webp':
        return 'image/webp';
      case 'gif':
        return 'image/gif';
      case 'heic':
        return 'image/heic';
      case 'pdf':
        return 'application/pdf';
      default:
        return 'application/octet-stream';
    }
  }

  async downloadEvidenceFile(
    id: string,
    index: number,
    companyId: string,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const inspection = await this.findOneEntity(id, companyId);
    const evidencias = inspection.evidencias || [];
    const evidence = evidencias[index];
    if (!evidence || !evidence.url) {
      throw new NotFoundException('Evidência não encontrada.');
    }

    // Evidência salva inline (fallback quando S3 está desabilitado)
    if (evidence.url.startsWith('data:')) {
      const match = evidence.url.match(/^data:(.+?);base64,(.+)$/);
      if (!match) {
        throw new BadRequestException('Evidência inline inválida.');
      }
      const contentType = match[1] || 'application/octet-stream';
      const buffer = Buffer.from(match[2], 'base64');
      const filename =
        evidence.original_name ||
        `evidencia-${index + 1}.${contentType.split('/')[1] || 'bin'}`;
      return { buffer, contentType, filename };
    }

    const key = evidence.url;
    const filename =
      evidence.original_name ||
      key.split('/').pop() ||
      `evidencia-${index + 1}.bin`;

    const buffer = await this.s3Service.downloadFile(key);
    const contentType = this.guessContentType(filename);
    return { buffer, contentType, filename };
  }

  async findOneEntity(id: string, companyId: string): Promise<Inspection> {
    const inspection = await this.tenantRepo.findOne(id, companyId, {
      relations: ['site', 'responsavel', 'company'],
    });

    if (!inspection) {
      throw new NotFoundException(`Inspeção com ID ${id} não encontrada`);
    }

    return inspection;
  }

  async update(
    id: string,
    updateInspectionDto: UpdateInspectionDto,
    companyId: string,
  ): Promise<InspectionResponseDto> {
    const inspection = await this.findOneEntity(id, companyId);
    await this.assertInspectionDocumentMutable(inspection);
    const payload = this.buildUpdatePayload(updateInspectionDto);
    await this.validateLinkedRecords(payload, companyId);
    Object.assign(inspection, payload);
    const saved = await this.inspectionsRepository.save(inspection);
    const inlineEvidenceCount = this.countInlineEvidence(payload.evidencias);
    this.logInspectionEvent('log', 'inspection_updated', {
      inspectionId: saved.id,
      companyId,
      riskCount: payload.perigos_riscos?.length,
      actionCount: payload.plano_acao?.length,
      evidenceCount: payload.evidencias?.length,
      inlineEvidenceCount,
      degradedInlineEvidence: inlineEvidenceCount > 0,
    });
    return plainToClass(InspectionResponseDto, saved);
  }

  async remove(id: string, companyId: string): Promise<void> {
    const inspection = await this.findOneEntity(id, companyId);
    await this.documentGovernanceService.removeFinalDocumentReference({
      companyId: inspection.company_id,
      module: 'inspection',
      entityId: inspection.id,
      removeEntityState: async (manager) => {
        await manager.getRepository(Inspection).delete({ id: inspection.id });
      },
      cleanupStoredFile: (fileKey) =>
        this.documentStorageService.deleteFile(fileKey),
    });
  }

  async attachEvidence(
    id: string,
    file: Express.Multer.File,
    descricao: string | undefined,
    companyId: string,
  ): Promise<InspectionEvidenceAttachResponse> {
    if (!file) throw new BadRequestException('Arquivo não enviado.');
    const inspection = await this.findOneEntity(id, companyId);
    await this.assertInspectionDocumentMutable(inspection);

    let entry;
    let storageMode: InspectionEvidenceAttachResponse['storageMode'] = 's3';
    let message: string | null = null;
    try {
      const key = this.s3Service.generateDocumentKey(
        inspection.company_id,
        'inspections',
        id,
        file.originalname,
      );
      const uploadBody =
        file.path && (!file.buffer || file.buffer.length === 0)
          ? createReadStream(file.path)
          : file.buffer;

      await this.s3Service.uploadFile(key, uploadBody, file.mimetype);
      entry = {
        descricao: this.normalizeRequiredText(
          descricao || file.originalname || 'Evidência sem descrição',
        ),
        url: key,
        original_name: file.originalname,
      };
    } catch (err) {
      storageMode = 'inline-fallback';
      message =
        'Storage indisponível. Evidência armazenada temporariamente em modo degradado inline.';
      this.logInspectionEvent('warn', 'inspection_evidence_storage_degraded', {
        inspectionId: inspection.id,
        companyId: inspection.company_id,
        originalName: file.originalname,
        mimeType: file.mimetype,
        fileSizeBytes: file.size || file.buffer?.length || 0,
        error: err instanceof Error ? err.message : String(err),
      });
      const maxInlineEvidenceBytes = getInspectionInlineEvidenceMaxBytes();
      const fileSizeBytes = file.size || file.buffer?.length || 0;

      if (fileSizeBytes > maxInlineEvidenceBytes) {
        throw new ServiceUnavailableException(
          `Storage indisponível para evidência com ${(fileSizeBytes / 1024 / 1024).toFixed(2)}MB. Tente novamente quando o storage estiver disponível.`,
        );
      }

      const inlineBuffer =
        file.buffer && file.buffer.length > 0
          ? file.buffer
          : file.path
            ? await readFile(file.path)
            : undefined;

      if (!inlineBuffer || inlineBuffer.length === 0) {
        throw new BadRequestException(
          'Falha ao ler a evidência enviada para fallback inline.',
        );
      }

      const dataUrl = `data:${file.mimetype};base64,${inlineBuffer.toString('base64')}`;
      entry = {
        descricao: this.normalizeRequiredText(
          descricao || file.originalname || 'Evidência sem descrição',
        ),
        url: dataUrl,
        original_name: file.originalname,
      };
    }

    const evidencias = [...(inspection.evidencias || []), entry];
    await this.inspectionsRepository.update(id, { evidencias });

    this.logInspectionEvent('log', 'inspection_evidence_attached', {
      inspectionId: inspection.id,
      companyId: inspection.company_id,
      originalName: file.originalname,
      mimeType: file.mimetype,
      fileSizeBytes: file.size || file.buffer?.length || 0,
      storageMode,
      degraded: storageMode === 'inline-fallback',
      evidenceCount: evidencias.length,
    });

    return {
      evidencias,
      storageMode,
      degraded: storageMode === 'inline-fallback',
      message,
    };
  }

  async savePdf(
    id: string,
    file: Express.Multer.File,
    companyId: string,
  ): Promise<{ fileKey: string; folderPath: string; originalName: string }> {
    const inspection = await this.findOneEntity(id, companyId);
    await this.assertInspectionDocumentMutable(inspection);

    const documentDate = this.getInspectionDocumentDate(inspection);
    const year = documentDate.getFullYear();
    const weekNumber = String(getIsoWeekNumber(documentDate) || 1).padStart(
      2,
      '0',
    );
    const folderPath = `inspections/${inspection.company_id}/${year}/week-${weekNumber}`;
    const originalName =
      file.originalname?.trim() || `inspection-${inspection.id}.pdf`;
    const fileKey = this.documentStorageService.generateDocumentKey(
      inspection.company_id,
      `inspections/${year}/week-${weekNumber}`,
      inspection.id,
      originalName,
    );

    await this.documentStorageService.uploadFile(
      fileKey,
      file.buffer,
      file.mimetype,
    );

    try {
      await this.documentGovernanceService.registerFinalDocument({
        companyId: inspection.company_id,
        module: 'inspection',
        entityId: inspection.id,
        title: this.buildInspectionTitle(inspection),
        documentDate,
        documentCode: this.buildValidationCode(inspection),
        fileKey,
        folderPath,
        originalName,
        mimeType: file.mimetype,
        fileBuffer: file.buffer,
        createdBy: RequestContext.getUserId() || undefined,
      });
    } catch (error) {
      await cleanupUploadedFile(
        this.logger,
        `inspection:${inspection.id}`,
        fileKey,
        (key) => this.documentStorageService.deleteFile(key),
      );
      throw error;
    }

    this.logInspectionEvent('log', 'inspection_final_pdf_registered', {
      inspectionId: inspection.id,
      companyId: inspection.company_id,
      fileKey,
      folderPath,
      originalName,
      mimeType: file.mimetype,
      fileSizeBytes: file.buffer.length,
      documentCode: this.buildValidationCode(inspection),
    });

    return {
      fileKey,
      folderPath,
      originalName,
    };
  }

  async getPdfAccess(
    id: string,
    companyId: string,
  ): Promise<InspectionPdfAccessResponse> {
    const inspection = await this.findOneEntity(id, companyId);
    const registryEntry = await this.documentRegistryService.findByDocument(
      'inspection',
      inspection.id,
      'pdf',
      inspection.company_id,
    );

    if (!registryEntry) {
      return {
        entityId: inspection.id,
        hasFinalPdf: false,
        availability: 'not_emitted',
        fileKey: null,
        folderPath: null,
        originalName: null,
        url: null,
        message:
          'Relatório de inspeção ainda não possui PDF final emitido e governado.',
      };
    }

    let url: string | null = null;
    let availability: InspectionPdfAccessAvailability = 'ready';
    let message: string | null = null;
    try {
      url = await this.documentStorageService.getSignedUrl(
        registryEntry.file_key,
        3600,
      );
    } catch (error) {
      url = null;
      availability = 'registered_without_signed_url';
      message =
        'PDF final emitido, mas a URL segura está temporariamente indisponível.';
      this.logInspectionEvent('warn', 'inspection_pdf_signed_url_unavailable', {
        inspectionId: inspection.id,
        companyId: inspection.company_id,
        fileKey: registryEntry.file_key,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return {
      entityId: inspection.id,
      hasFinalPdf: true,
      availability,
      fileKey: registryEntry.file_key,
      folderPath: registryEntry.folder_path || null,
      originalName:
        registryEntry.original_name ||
        registryEntry.file_key.split('/').pop() ||
        'inspection.pdf',
      url,
      message,
    };
  }

  async listStoredFiles(filters: WeeklyBundleFilters) {
    return this.documentGovernanceService.listFinalDocuments(
      'inspection',
      filters,
    );
  }

  async getWeeklyBundle(filters: WeeklyBundleFilters) {
    return this.documentGovernanceService.getModuleWeeklyBundle(
      'inspection',
      'Inspeção',
      filters,
    );
  }

  private buildInspectionTitle(
    inspection: Pick<Inspection, 'tipo_inspecao' | 'setor_area'>,
  ) {
    return `${inspection.tipo_inspecao} - ${inspection.setor_area}`;
  }

  private getInspectionDocumentDate(
    inspection: Pick<Inspection, 'data_inspecao' | 'created_at'>,
  ): Date {
    const candidate = inspection.data_inspecao
      ? new Date(inspection.data_inspecao)
      : inspection.created_at
        ? new Date(inspection.created_at)
        : new Date();

    return Number.isNaN(candidate.getTime()) ? new Date() : candidate;
  }

  private async assertInspectionDocumentMutable(
    inspection: Pick<Inspection, 'id' | 'company_id'>,
  ): Promise<void> {
    const registryEntry = await this.documentRegistryService.findByDocument(
      'inspection',
      inspection.id,
      'pdf',
      inspection.company_id,
    );

    if (registryEntry) {
      throw new BadRequestException(
        'Relatório de inspeção com PDF final emitido. Edição bloqueada. Gere um novo relatório para alterar o documento.',
      );
    }
  }
}
