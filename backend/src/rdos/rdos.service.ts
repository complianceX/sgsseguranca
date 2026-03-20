import { createHash } from 'crypto';
import {
  BadRequestException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import { Rdo } from './entities/rdo.entity';
import { CreateRdoDto } from './dto/create-rdo.dto';
import { UpdateRdoDto } from './dto/update-rdo.dto';
import { Site } from '../sites/entities/site.entity';
import { User } from '../users/entities/user.entity';
import { TenantService } from '../common/tenant/tenant.service';
import {
  normalizeOffsetPagination,
  OffsetPage,
  toOffsetPage,
} from '../common/utils/offset-pagination.util';
import { MailService } from '../mail/mail.service';
import { DocumentStorageService } from '../common/services/document-storage.service';
import { DocumentGovernanceService } from '../document-registry/document-governance.service';
import { DocumentRegistryService } from '../document-registry/document-registry.service';
import { cleanupUploadedFile } from '../common/storage/storage-compensation.util';
import { WeeklyBundleFilters } from '../common/services/document-bundle.service';
import { RdoAuditService } from './rdo-audit.service';

const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  rascunho: ['enviado'],
  enviado: ['aprovado', 'rascunho'],
  aprovado: [],
  cancelado: [],
};

const CANCELABLE_STATUSES = new Set(['rascunho', 'enviado', 'aprovado']);

const CLIMA_LABEL: Record<string, string> = {
  ensolarado: 'Ensolarado ☀️',
  nublado: 'Nublado ☁️',
  chuvoso: 'Chuvoso 🌧️',
  parcialmente_nublado: 'Parcialmente Nublado 🌤️',
};

type RdoPdfAccessAvailability =
  | 'ready'
  | 'registered_without_signed_url'
  | 'not_emitted';

type RdoOperationalSignature = {
  nome: string;
  cpf: string;
  signed_at: string;
  signature_mode: 'operational_ack';
  verification_scope: 'document_integrity_snapshot';
  document_hash_algorithm: 'sha256';
  document_hash: string;
};

@Injectable()
export class RdosService {
  private readonly logger = new Logger(RdosService.name);

  constructor(
    @InjectRepository(Rdo)
    private rdosRepository: Repository<Rdo>,
    private tenantService: TenantService,
    private mailService: MailService,
    private documentStorageService: DocumentStorageService,
    private documentGovernanceService: DocumentGovernanceService,
    private documentRegistryService: DocumentRegistryService,
    private rdoAuditService: RdoAuditService,
  ) {}

  private async assertCompanyScopedEntityId<
    T extends { id: string; company_id: string },
  >(
    entity: { new (): T },
    companyId: string,
    id: string | null | undefined,
    label: string,
  ): Promise<void> {
    if (!id) {
      return;
    }

    const exists = await this.rdosRepository.manager
      .getRepository(entity)
      .exist({
        where: { id, company_id: companyId } as never,
      });

    if (!exists) {
      throw new BadRequestException(
        `${label} inválido para a empresa/tenant atual.`,
      );
    }
  }

  private async validateRelatedEntityScope(input: {
    companyId: string;
    siteId?: string | null;
    responsavelId?: string | null;
  }): Promise<void> {
    await Promise.all([
      this.assertCompanyScopedEntityId(
        Site,
        input.companyId,
        input.siteId,
        'Site',
      ),
      this.assertCompanyScopedEntityId(
        User,
        input.companyId,
        input.responsavelId,
        'Responsável',
      ),
    ]);
  }

  private resolveCompanyIdForCreate(requestedCompanyId?: string): string {
    const tenantId = this.tenantService.getTenantId();

    if (tenantId) {
      if (requestedCompanyId && requestedCompanyId !== tenantId) {
        this.logger.warn({
          event: 'rdo_create_company_override_ignored',
          tenantId,
          requestedCompanyId,
        });
      }
      return tenantId;
    }

    if (requestedCompanyId) {
      return requestedCompanyId;
    }

    throw new BadRequestException(
      'Tenant/empresa não identificado para criação do RDO.',
    );
  }

  private resolveStatusForCreate(requestedStatus?: string): string {
    if (!requestedStatus || requestedStatus === 'rascunho') {
      return 'rascunho';
    }

    throw new BadRequestException(
      'O status do RDO é controlado pelo fluxo formal de tramitação. Crie o documento como rascunho e use PATCH /rdos/:id/status para avançar o ciclo.',
    );
  }

  private logRdoEvent(
    event: string,
    rdo: Pick<
      Rdo,
      | 'id'
      | 'company_id'
      | 'status'
      | 'site_id'
      | 'responsavel_id'
      | 'pdf_file_key'
    >,
    metadata: Record<string, unknown> = {},
  ) {
    this.logger.log({
      event,
      rdoId: rdo.id,
      companyId: rdo.company_id,
      status: rdo.status,
      siteId: rdo.site_id ?? null,
      responsavelId: rdo.responsavel_id ?? null,
      hasFinalPdf: Boolean(rdo.pdf_file_key),
      ...metadata,
    });
  }

  private async generateNumero(companyId: string): Promise<string> {
    const now = new Date();
    const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prefix = `RDO-${yyyymm}-`;
    const last = await this.rdosRepository
      .createQueryBuilder('rdo')
      .select('MAX(rdo.numero)', 'max')
      .where('rdo.company_id = :companyId', { companyId })
      .andWhere('rdo.numero LIKE :prefix', { prefix: `${prefix}%` })
      .getRawOne<{ max: string | null }>();
    const lastSeq = last?.max ? Number(last.max.slice(prefix.length)) || 0 : 0;
    return `${prefix}${String(lastSeq + 1).padStart(3, '0')}`;
  }

  private buildSignatureTrackedSnapshot(
    rdo: Pick<
      Rdo,
      | 'data'
      | 'site_id'
      | 'responsavel_id'
      | 'clima_manha'
      | 'clima_tarde'
      | 'temperatura_min'
      | 'temperatura_max'
      | 'condicao_terreno'
      | 'mao_de_obra'
      | 'equipamentos'
      | 'materiais_recebidos'
      | 'servicos_executados'
      | 'ocorrencias'
      | 'houve_acidente'
      | 'houve_paralisacao'
      | 'motivo_paralisacao'
      | 'observacoes'
      | 'programa_servicos_amanha'
    >,
  ) {
    return {
      data: rdo.data,
      site_id: rdo.site_id ?? null,
      responsavel_id: rdo.responsavel_id ?? null,
      clima_manha: rdo.clima_manha ?? null,
      clima_tarde: rdo.clima_tarde ?? null,
      temperatura_min: rdo.temperatura_min ?? null,
      temperatura_max: rdo.temperatura_max ?? null,
      condicao_terreno: rdo.condicao_terreno ?? null,
      mao_de_obra: rdo.mao_de_obra ?? [],
      equipamentos: rdo.equipamentos ?? [],
      materiais_recebidos: rdo.materiais_recebidos ?? [],
      servicos_executados: rdo.servicos_executados ?? [],
      ocorrencias: rdo.ocorrencias ?? [],
      houve_acidente: rdo.houve_acidente,
      houve_paralisacao: rdo.houve_paralisacao,
      motivo_paralisacao: rdo.motivo_paralisacao ?? null,
      observacoes: rdo.observacoes ?? null,
      programa_servicos_amanha: rdo.programa_servicos_amanha ?? null,
    };
  }

  private buildSnapshotHash(
    rdo: Pick<
      Rdo,
      | 'data'
      | 'site_id'
      | 'responsavel_id'
      | 'clima_manha'
      | 'clima_tarde'
      | 'temperatura_min'
      | 'temperatura_max'
      | 'condicao_terreno'
      | 'mao_de_obra'
      | 'equipamentos'
      | 'materiais_recebidos'
      | 'servicos_executados'
      | 'ocorrencias'
      | 'houve_acidente'
      | 'houve_paralisacao'
      | 'motivo_paralisacao'
      | 'observacoes'
      | 'programa_servicos_amanha'
    >,
  ): string {
    return createHash('sha256')
      .update(JSON.stringify(this.buildSignatureTrackedSnapshot(rdo)))
      .digest('hex');
  }

  private resetSignatures(
    rdo: Pick<
      Rdo,
      | 'assinatura_responsavel'
      | 'assinatura_engenheiro'
      | 'status'
      | 'id'
      | 'company_id'
      | 'site_id'
      | 'responsavel_id'
      | 'pdf_file_key'
    >,
    reason: 'content_changed' | 'returned_to_draft',
  ): boolean {
    if (!rdo.assinatura_responsavel && !rdo.assinatura_engenheiro) {
      return false;
    }

    rdo.assinatura_responsavel = null as unknown as string;
    rdo.assinatura_engenheiro = null as unknown as string;

    this.logRdoEvent('rdo_signatures_reset', rdo, { reason });
    return true;
  }

  private assertRdoNotCancelled(
    rdo: Pick<Rdo, 'status'>,
    action: 'editado' | 'assinado' | 'movimentado',
  ) {
    if (rdo.status === 'cancelado') {
      throw new BadRequestException(`RDO cancelado não pode ser ${action}.`);
    }
  }

  async create(createRdoDto: CreateRdoDto): Promise<Rdo> {
    const companyId = this.resolveCompanyIdForCreate(createRdoDto.company_id);
    await this.validateRelatedEntityScope({
      companyId,
      siteId: createRdoDto.site_id,
      responsavelId: createRdoDto.responsavel_id,
    });

    const numero = await this.generateNumero(companyId);
    const rdo = this.rdosRepository.create({
      ...createRdoDto,
      company_id: companyId,
      status: this.resolveStatusForCreate(createRdoDto.status),
      numero,
    });
    const saved = await this.rdosRepository.save(rdo);
    this.logRdoEvent('rdo_created', saved);
    await this.rdoAuditService.recordEvent(saved.id, 'CREATED', {
      numero: saved.numero,
      status: saved.status,
      siteId: saved.site_id ?? null,
      responsavelId: saved.responsavel_id ?? null,
    });
    return saved;
  }

  async findPaginated(opts?: {
    page?: number;
    limit?: number;
    site_id?: string;
    status?: string;
    data_inicio?: string;
    data_fim?: string;
  }): Promise<OffsetPage<Rdo>> {
    const tenantId = this.tenantService.getTenantId();
    const { page, limit, skip } = normalizeOffsetPagination(opts, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const qb = this.rdosRepository
      .createQueryBuilder('rdo')
      .leftJoinAndSelect('rdo.site', 'site')
      .leftJoinAndSelect('rdo.responsavel', 'responsavel')
      .orderBy('rdo.data', 'DESC')
      .addOrderBy('rdo.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (tenantId) {
      qb.andWhere('rdo.company_id = :tenantId', { tenantId });
    }
    if (opts?.site_id) {
      qb.andWhere('rdo.site_id = :siteId', { siteId: opts.site_id });
    }
    if (opts?.status) {
      qb.andWhere('rdo.status = :status', { status: opts.status });
    }
    if (opts?.data_inicio) {
      qb.andWhere('rdo.data >= :dataInicio', { dataInicio: opts.data_inicio });
    }
    if (opts?.data_fim) {
      qb.andWhere('rdo.data <= :dataFim', { dataFim: opts.data_fim });
    }

    const [data, total] = await qb.getManyAndCount();
    return toOffsetPage(data, total, page, limit);
  }

  async findOne(id: string): Promise<Rdo> {
    const tenantId = this.tenantService.getTenantId();
    const rdo = await this.rdosRepository.findOne({
      where: tenantId ? { id, company_id: tenantId } : { id },
      relations: ['site', 'responsavel', 'company'],
    });
    if (!rdo) {
      throw new NotFoundException(`RDO com ID ${id} não encontrado`);
    }
    return rdo;
  }

  async update(id: string, updateRdoDto: UpdateRdoDto): Promise<Rdo> {
    const rdo = await this.findOne(id);
    await this.assertRdoDocumentMutable(rdo);
    this.assertRdoNotCancelled(rdo, 'editado');
    if ('status' in updateRdoDto && updateRdoDto.status !== undefined) {
      throw new BadRequestException(
        'Use PATCH /rdos/:id/status para alterar o status do RDO.',
      );
    }
    if (
      updateRdoDto.company_id !== undefined &&
      updateRdoDto.company_id !== rdo.company_id
    ) {
      throw new BadRequestException(
        'O company_id do RDO não pode ser alterado pelo endpoint genérico.',
      );
    }

    await this.validateRelatedEntityScope({
      companyId: rdo.company_id,
      siteId:
        updateRdoDto.site_id !== undefined ? updateRdoDto.site_id : rdo.site_id,
      responsavelId:
        updateRdoDto.responsavel_id !== undefined
          ? updateRdoDto.responsavel_id
          : rdo.responsavel_id,
    });

    const previousSnapshot = this.buildSnapshotHash(rdo);
    const previousStatus = rdo.status;
    const hadSignatures = Boolean(
      rdo.assinatura_responsavel || rdo.assinatura_engenheiro,
    );
    Object.assign(rdo, { ...updateRdoDto, company_id: rdo.company_id });
    const nextSnapshot = this.buildSnapshotHash(rdo);
    const contentChanged = previousSnapshot !== nextSnapshot;
    const signaturesReset =
      hadSignatures && contentChanged
        ? this.resetSignatures(rdo, 'content_changed')
        : false;
    const approvalReset = contentChanged && previousStatus === 'aprovado';
    if (approvalReset) {
      rdo.status = 'enviado';
    }
    const saved = await this.rdosRepository.save(rdo);
    this.logRdoEvent('rdo_updated', saved);
    await this.rdoAuditService.recordEvent(saved.id, 'UPDATED', {
      siteId: saved.site_id ?? null,
      responsavelId: saved.responsavel_id ?? null,
      signaturesReset,
      previousStatus,
      currentStatus: saved.status,
      approvalReset,
    });
    if (signaturesReset) {
      await this.rdoAuditService.recordEvent(saved.id, 'SIGNATURES_RESET', {
        reason: 'content_changed',
      });
    }
    return saved;
  }

  async updateStatus(id: string, newStatus: string): Promise<Rdo> {
    const rdo = await this.findOne(id);
    await this.assertRdoDocumentMutable(rdo);
    this.assertRdoNotCancelled(rdo, 'movimentado');
    const allowed = ALLOWED_STATUS_TRANSITIONS[rdo.status] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Transição de "${rdo.status}" para "${newStatus}" não permitida`,
      );
    }
    if (newStatus === 'aprovado') {
      this.assertRdoReadyForFinalDocument(rdo);
    }
    const previousStatus = rdo.status;
    rdo.status = newStatus;
    const signaturesReset =
      newStatus === 'rascunho'
        ? this.resetSignatures(rdo, 'returned_to_draft')
        : false;
    const saved = await this.rdosRepository.save(rdo);
    this.logRdoEvent('rdo_status_changed', saved, {
      previousStatus,
      newStatus,
      signaturesReset,
    });

    await this.rdoAuditService.recordStatusChange(
      saved.id,
      previousStatus,
      newStatus,
    );
    if (signaturesReset) {
      await this.rdoAuditService.recordEvent(saved.id, 'SIGNATURES_RESET', {
        reason: 'returned_to_draft',
      });
    }

    return saved;
  }

  async cancel(id: string, reason: string): Promise<Rdo> {
    const rdo = await this.findOne(id);
    await this.assertRdoDocumentMutable(rdo);

    if (!CANCELABLE_STATUSES.has(rdo.status)) {
      throw new BadRequestException(
        `Transição de "${rdo.status}" para "cancelado" não permitida.`,
      );
    }

    const previousStatus = rdo.status;
    rdo.status = 'cancelado';
    const saved = await this.rdosRepository.save(rdo);

    this.logRdoEvent('rdo_canceled', saved, { reason });
    await this.rdoAuditService.recordCancellation(
      saved.id,
      reason,
      previousStatus,
    );

    return saved;
  }

  async getAuditTrail(id: string) {
    await this.findOne(id); // Garante a validação de existência e o escopo do Tenant atual
    const events = await this.rdoAuditService.getEventsForRdo(id);

    const EVENT_LABELS: Record<string, string> = {
      CREATED: 'Criado',
      UPDATED: 'Atualizado',
      CANCELED: 'Cancelado',
      STATUS_CHANGED: 'Status Alterado',
      PDF_GENERATED: 'PDF Gerado',
      SIGNED: 'Assinado',
      EMAIL_SENT: 'E-mail enviado',
      REMOVED: 'Removido',
      SIGNATURES_RESET: 'Assinaturas invalidadas',
      LEGACY_SAVE_PDF_ATTEMPT: 'Tentativa em endpoint legado',
    };

    return events.map((event) => ({
      id: event.id,
      eventType: event.event_type,
      eventLabel: EVENT_LABELS[event.event_type] || event.event_type,
      userId: event.user_id,
      createdAt: event.created_at,
      details: event.details || {},
    }));
  }

  async sign(
    id: string,
    body: {
      tipo: 'responsavel' | 'engenheiro';
      nome: string;
      cpf: string;
    },
  ): Promise<Rdo> {
    const rdo = await this.findOne(id);
    await this.assertRdoDocumentMutable(rdo);
    this.assertRdoNotCancelled(rdo, 'assinado');

    if (rdo.status === 'rascunho') {
      throw new BadRequestException(
        'Envie o RDO para revisão antes de coletar assinaturas.',
      );
    }

    const signaturePayload: RdoOperationalSignature = {
      nome: body.nome.trim(),
      cpf: body.cpf.trim(),
      signed_at: new Date().toISOString(),
      signature_mode: 'operational_ack',
      verification_scope: 'document_integrity_snapshot',
      document_hash_algorithm: 'sha256',
      document_hash: this.buildSnapshotHash(rdo),
    };

    const sigData = JSON.stringify(signaturePayload);

    if (body.tipo === 'responsavel') {
      rdo.assinatura_responsavel = sigData;
    } else {
      rdo.assinatura_engenheiro = sigData;
    }

    const saved = await this.rdosRepository.save(rdo);
    this.logRdoEvent('rdo_signed', saved, {
      signatureType: body.tipo,
      signatureMode: signaturePayload.signature_mode,
      documentHash: signaturePayload.document_hash,
    });

    await this.rdoAuditService.recordSignature(saved.id, body.tipo, body.nome);

    return saved;
  }

  async savePdf(
    id: string,
    file: Express.Multer.File,
  ): Promise<{ fileKey: string; folderPath: string; originalName: string }> {
    const rdo = await this.findOne(id);
    await this.assertRdoDocumentMutable(rdo);
    this.assertRdoReadyForFinalDocument(rdo);

    const documentDate = this.getRdoDocumentDate(rdo);
    const year = documentDate.getFullYear();
    const weekNumber = String(this.getIsoWeekNumber(documentDate)).padStart(
      2,
      '0',
    );
    const folderPath = `rdos/${rdo.company_id}/${year}/week-${weekNumber}`;
    const originalName =
      file.originalname?.trim() || `${rdo.numero || `rdo-${rdo.id}`}.pdf`;
    const fileKey = this.documentStorageService.generateDocumentKey(
      rdo.company_id,
      `rdos/${year}/week-${weekNumber}`,
      rdo.id,
      originalName,
    );

    await this.documentStorageService.uploadFile(
      fileKey,
      file.buffer,
      file.mimetype,
    );

    try {
      await this.documentGovernanceService.registerFinalDocument({
        companyId: rdo.company_id,
        module: 'rdo',
        entityId: rdo.id,
        title: this.buildRdoTitle(rdo),
        documentDate,
        documentCode: this.buildValidationCode(rdo),
        fileKey,
        folderPath,
        originalName,
        mimeType: file.mimetype,
        fileBuffer: file.buffer,
        persistEntityMetadata: async (manager) => {
          await manager.getRepository(Rdo).update(
            { id: rdo.id },
            {
              pdf_file_key: fileKey,
              pdf_folder_path: folderPath,
              pdf_original_name: originalName,
            },
          );
        },
      });
    } catch (error) {
      await cleanupUploadedFile(this.logger, `rdo:${rdo.id}`, fileKey, (key) =>
        this.documentStorageService.deleteFile(key),
      );
      throw error;
    }

    this.logRdoEvent('rdo_pdf_uploaded', rdo, {
      fileKey,
      folderPath,
      originalName,
    });

    await this.rdoAuditService.recordPdfGenerated(
      rdo.id,
      fileKey,
      originalName,
    );

    return {
      fileKey,
      folderPath,
      originalName,
    };
  }

  async markPdfSaved(
    id: string,
    _body?: { filename?: string },
  ): Promise<never> {
    const rdo = await this.findOne(id);
    this.logRdoEvent('rdo_legacy_save_pdf_attempt', rdo, {
      endpoint: 'POST /rdos/:id/save-pdf',
    });
    await this.rdoAuditService.recordEvent(rdo.id, 'LEGACY_SAVE_PDF_ATTEMPT', {
      endpoint: 'POST /rdos/:id/save-pdf',
      deprecated: true,
    });
    throw new GoneException(
      'O endpoint legado POST /rdos/:id/save-pdf foi descontinuado. Envie o arquivo real por POST /rdos/:id/file.',
    );
  }

  async getPdfAccess(id: string): Promise<{
    entityId: string;
    hasFinalPdf: boolean;
    availability: RdoPdfAccessAvailability;
    message: string | null;
    fileKey: string | null;
    folderPath: string | null;
    originalName: string | null;
    url: string | null;
  }> {
    const rdo = await this.findOne(id);
    const registryEntry = await this.documentRegistryService.findByDocument(
      'rdo',
      rdo.id,
      'pdf',
      rdo.company_id,
    );

    if (!registryEntry) {
      return {
        entityId: rdo.id,
        hasFinalPdf: false,
        availability: 'not_emitted',
        message: 'O PDF final do RDO ainda não foi emitido.',
        fileKey: null,
        folderPath: null,
        originalName: null,
        url: null,
      };
    }

    let url: string | null = null;
    let availability: RdoPdfAccessAvailability = 'ready';
    let message: string | null = null;
    try {
      url = await this.documentStorageService.getSignedUrl(
        registryEntry.file_key,
        3600,
      );
    } catch {
      availability = 'registered_without_signed_url';
      message =
        'O PDF final do RDO foi emitido, mas a URL segura não está disponível agora.';
      url = null;
    }

    return {
      entityId: rdo.id,
      hasFinalPdf: true,
      availability,
      message,
      fileKey: registryEntry.file_key,
      folderPath: registryEntry.folder_path || null,
      originalName:
        registryEntry.original_name ||
        registryEntry.file_key.split('/').pop() ||
        'rdo.pdf',
      url,
    };
  }

  async sendEmail(id: string, to: string[]): Promise<void> {
    const rdo = await this.findOne(id);
    if (!to.length) {
      return;
    }
    const dataFormatada = new Date(rdo.data).toLocaleDateString('pt-BR');
    const totalTrab = (rdo.mao_de_obra ?? []).reduce(
      (s, m) => s + (m.quantidade ?? 0),
      0,
    );
    const totalEquip = (rdo.equipamentos ?? []).length;
    const totalServicos = (rdo.servicos_executados ?? []).length;
    const totalOcorrencias = (rdo.ocorrencias ?? []).length;

    const climaManha = rdo.clima_manha
      ? (CLIMA_LABEL[rdo.clima_manha] ?? rdo.clima_manha)
      : '-';
    const climaTarde = rdo.clima_tarde
      ? (CLIMA_LABEL[rdo.clima_tarde] ?? rdo.clima_tarde)
      : '-';
    const registryEntry = await this.documentRegistryService.findByDocument(
      'rdo',
      rdo.id,
      'pdf',
      rdo.company_id,
    );
    const subject = `RDO ${rdo.numero} — ${dataFormatada}${rdo.site?.nome ? ` · ${rdo.site.nome}` : ''}`;
    const text = `RDO ${rdo.numero} de ${dataFormatada}.`;

    const html = `
      <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:0;border-radius:12px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#1e6b43,#0c2e1a);padding:28px 32px;color:white;">
          <div style="font-size:11px;letter-spacing:0.1em;opacity:0.7;text-transform:uppercase;margin-bottom:4px;">GST — Gestão de Segurança do Trabalho</div>
          <h1 style="margin:0;font-size:22px;font-weight:700;">Relatório Diário de Obra</h1>
          <div style="font-size:15px;opacity:0.85;margin-top:4px;">${rdo.numero} &nbsp;·&nbsp; ${dataFormatada}</div>
        </div>
        <div style="padding:28px 32px;background:#fff;">
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:8px 0;color:#6b7280;">Obra/Setor</td><td style="padding:8px 0;font-weight:600;color:#111827;">${rdo.site?.nome ?? '-'}</td></tr>
            <tr><td style="padding:8px 0;color:#6b7280;">Responsável</td><td style="padding:8px 0;font-weight:600;color:#111827;">${rdo.responsavel?.nome ?? '-'}</td></tr>
            <tr><td style="padding:8px 0;color:#6b7280;">Status</td><td style="padding:8px 0;"><span style="background:#dcfce7;color:#166534;padding:3px 10px;border-radius:9999px;font-size:12px;font-weight:600;">${rdo.status.toUpperCase()}</span></td></tr>
            <tr><td style="padding:8px 0;color:#6b7280;">Clima manhã</td><td style="padding:8px 0;color:#111827;">${climaManha}</td></tr>
            <tr><td style="padding:8px 0;color:#6b7280;">Clima tarde</td><td style="padding:8px 0;color:#111827;">${climaTarde}</td></tr>
            ${rdo.temperatura_min != null ? `<tr><td style="padding:8px 0;color:#6b7280;">Temperatura</td><td style="padding:8px 0;color:#111827;">${rdo.temperatura_min}°C — ${rdo.temperatura_max}°C</td></tr>` : ''}
          </table>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:18px 0;"/>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div style="background:#f0fdf4;border-radius:8px;padding:14px;text-align:center;">
              <div style="font-size:24px;font-weight:700;color:#166534;">${totalTrab}</div>
              <div style="font-size:12px;color:#4b7a5c;">Trabalhadores</div>
            </div>
            <div style="background:#eff6ff;border-radius:8px;padding:14px;text-align:center;">
              <div style="font-size:24px;font-weight:700;color:#1d4ed8;">${totalServicos}</div>
              <div style="font-size:12px;color:#3b5ec4;">Serviços exec.</div>
            </div>
            <div style="background:#fefce8;border-radius:8px;padding:14px;text-align:center;">
              <div style="font-size:24px;font-weight:700;color:#854d0e;">${totalEquip}</div>
              <div style="font-size:12px;color:#a16207;">Equipamentos</div>
            </div>
            <div style="background:#fdf4ff;border-radius:8px;padding:14px;text-align:center;">
              <div style="font-size:24px;font-weight:700;color:#7e22ce;">${totalOcorrencias}</div>
              <div style="font-size:12px;color:#6b21a8;">Ocorrências</div>
            </div>
          </div>
          ${rdo.houve_acidente ? '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;margin-top:16px;color:#991b1b;font-weight:600;">⚠️ Acidente registrado neste RDO</div>' : ''}
          ${rdo.houve_paralisacao ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin-top:12px;color:#92400e;font-weight:600;">⏸️ Paralisação: ${rdo.motivo_paralisacao ?? 'sem motivo informado'}</div>` : ''}
          ${rdo.observacoes ? `<div style="margin-top:16px;"><div style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Observações</div><div style="font-size:14px;color:#374151;line-height:1.6;">${rdo.observacoes}</div></div>` : ''}
        </div>
        <div style="padding:16px 32px;background:#f8fafc;text-align:center;font-size:11px;color:#9ca3af;">
          GST — Gestão de Segurança do Trabalho · Enviado automaticamente
        </div>
      </div>
    `;

    if (registryEntry?.file_key) {
      const pdfBuffer = await this.documentStorageService.downloadFileBuffer(
        registryEntry.file_key,
      );
      const attachmentFilename =
        registryEntry.original_name || `${rdo.numero || rdo.id}.pdf`;

      for (const email of to) {
        await this.mailService.sendMailSimple(
          email,
          subject,
          `${text} O PDF final governado segue em anexo.`,
          { companyId: rdo.company_id },
          [
            {
              filename: attachmentFilename,
              content: pdfBuffer,
              contentType: 'application/pdf',
            },
          ],
          {
            html,
            filename: attachmentFilename,
          },
        );
      }
      this.logRdoEvent('rdo_email_sent', rdo, {
        recipients: to.length,
        hasGovernedPdf: true,
      });
      await this.rdoAuditService.recordEvent(rdo.id, 'EMAIL_SENT', {
        recipients: to.length,
        hasGovernedPdf: true,
      });
      return;
    }

    for (const email of to) {
      await this.mailService.sendMail(
        email,
        subject,
        `${text} Acesse o sistema para visualizar o documento completo.`,
        html,
        { companyId: rdo.company_id },
      );
    }
    this.logRdoEvent('rdo_email_sent', rdo, {
      recipients: to.length,
      hasGovernedPdf: false,
    });
    await this.rdoAuditService.recordEvent(rdo.id, 'EMAIL_SENT', {
      recipients: to.length,
      hasGovernedPdf: false,
    });
  }

  async listFiles(filters: WeeklyBundleFilters = {}) {
    return this.documentGovernanceService.listFinalDocuments('rdo', filters);
  }

  async getWeeklyBundle(filters: WeeklyBundleFilters) {
    return this.documentGovernanceService.getModuleWeeklyBundle(
      'rdo',
      'RDO',
      filters,
    );
  }

  async remove(id: string): Promise<void> {
    const rdo = await this.findOne(id);

    if (rdo.status === 'aprovado' || rdo.status === 'cancelado') {
      throw new BadRequestException(
        'RDOs aprovados ou cancelados não podem ser excluídos fisicamente. Utilize o cancelamento explícito.',
      );
    }

    await this.documentGovernanceService.removeFinalDocumentReference({
      companyId: rdo.company_id,
      module: 'rdo',
      entityId: rdo.id,
      removeEntityState: async (manager) => {
        await manager.getRepository(Rdo).update(
          { id: rdo.id },
          {
            pdf_file_key: null as unknown as string,
            pdf_folder_path: null as unknown as string,
            pdf_original_name: null as unknown as string,
          },
        );
      },
      cleanupStoredFile: (fileKey) =>
        this.documentStorageService.deleteFile(fileKey),
    });
    await this.rdosRepository.remove(rdo);
    this.logRdoEvent('rdo_removed', rdo);
    await this.rdoAuditService.recordEvent(rdo.id, 'REMOVED');
  }

  async getAnalyticsOverview(): Promise<{
    totalRdos: number;
    rascunho: number;
    enviado: number;
    aprovado: number;
    cancelado: number;
  }> {
    const tenantId = this.tenantService.getTenantId();
    const baseWhere = tenantId ? { company_id: tenantId } : {};

    const countByStatus = (status: string) =>
      this.rdosRepository.count({
        where: {
          ...baseWhere,
          status,
        },
      });

    const [totalRdos, rascunho, enviado, aprovado, cancelado] =
      await Promise.all([
        this.rdosRepository.count({ where: baseWhere }),
        countByStatus('rascunho'),
        countByStatus('enviado'),
        countByStatus('aprovado'),
        countByStatus('cancelado'),
      ]);

    return {
      totalRdos,
      rascunho,
      enviado,
      aprovado,
      cancelado,
    };
  }

  async exportExcel(): Promise<Buffer> {
    const tenantId = this.tenantService.getTenantId();
    const qb = this.rdosRepository
      .createQueryBuilder('rdo')
      .leftJoinAndSelect('rdo.site', 'site')
      .leftJoinAndSelect('rdo.responsavel', 'responsavel')
      .orderBy('rdo.data', 'DESC');

    if (tenantId) {
      qb.where('rdo.company_id = :tenantId', { tenantId });
    }

    const rdos = await qb.getMany();

    const rows = rdos.map((r) => {
      const totalTrab = (r.mao_de_obra ?? []).reduce(
        (s, m) => s + (m.quantidade ?? 0),
        0,
      );
      return {
        Número: r.numero,
        Data: new Date(r.data).toLocaleDateString('pt-BR'),
        'Obra/Setor': r.site?.nome ?? '',
        Responsável: r.responsavel?.nome ?? '',
        Status: r.status,
        'Total Trabalhadores': totalTrab,
        Equipamentos: (r.equipamentos ?? []).length,
        Materiais: (r.materiais_recebidos ?? []).length,
        'Serviços Exec.': (r.servicos_executados ?? []).length,
        Ocorrências: (r.ocorrencias ?? []).length,
        'Clima Manhã': r.clima_manha
          ? (CLIMA_LABEL[r.clima_manha] ?? r.clima_manha)
          : '',
        'Clima Tarde': r.clima_tarde
          ? (CLIMA_LABEL[r.clima_tarde] ?? r.clima_tarde)
          : '',
        'Temp. Mín (°C)': r.temperatura_min ?? '',
        'Temp. Máx (°C)': r.temperatura_max ?? '',
        'Condição Terreno': r.condicao_terreno ?? '',
        'Houve Acidente': r.houve_acidente ? 'Sim' : 'Não',
        'Houve Paralisação': r.houve_paralisacao ? 'Sim' : 'Não',
        'Motivo Paralisação': r.motivo_paralisacao ?? '',
        'Tem PDF': r.pdf_file_key ? 'Sim' : 'Não',
        'Assinado Responsável': r.assinatura_responsavel ? 'Sim' : 'Não',
        'Assinado Engenheiro': r.assinatura_engenheiro ? 'Sim' : 'Não',
        Observações: r.observacoes ?? '',
        'Programa Amanhã': r.programa_servicos_amanha ?? '',
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'RDOs');
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }

  private getRdoDocumentDate(rdo: Pick<Rdo, 'data' | 'created_at'>): Date {
    const dateValue = rdo.data as Date | string | null | undefined;

    if (dateValue instanceof Date && !Number.isNaN(dateValue.getTime())) {
      const looksLikeDateColumn =
        dateValue.getUTCHours() === 0 &&
        dateValue.getUTCMinutes() === 0 &&
        dateValue.getUTCSeconds() === 0 &&
        dateValue.getUTCMilliseconds() === 0;

      if (looksLikeDateColumn) {
        return new Date(
          dateValue.getUTCFullYear(),
          dateValue.getUTCMonth(),
          dateValue.getUTCDate(),
        );
      }

      return new Date(dateValue.getTime());
    }

    if (typeof dateValue === 'string') {
      const dateOnlyMatch = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (dateOnlyMatch) {
        const [, year, month, day] = dateOnlyMatch;
        return new Date(Number(year), Number(month) - 1, Number(day));
      }

      const parsed = new Date(dateValue);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    const createdAt = new Date(rdo.created_at);
    return Number.isNaN(createdAt.getTime()) ? new Date() : createdAt;
  }

  private buildRdoTitle(
    rdo: Pick<Rdo, 'numero'> & { site?: { nome?: string } | null },
  ): string {
    return rdo.site?.nome ? `${rdo.numero} - ${rdo.site.nome}` : rdo.numero;
  }

  private buildValidationCode(rdo: Pick<Rdo, 'id' | 'data' | 'created_at'>) {
    const documentDate = this.getRdoDocumentDate(rdo);
    return `RDO-${this.getIsoYear(documentDate)}-${String(
      this.getIsoWeekNumber(documentDate),
    ).padStart(2, '0')}-${rdo.id.slice(0, 8).toUpperCase()}`;
  }

  private getIsoYear(date: Date): number {
    const target = new Date(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
    );
    target.setUTCDate(target.getUTCDate() + 4 - (target.getUTCDay() || 7));
    return target.getUTCFullYear();
  }

  private getIsoWeekNumber(date: Date): number {
    const target = new Date(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
    );
    target.setUTCDate(target.getUTCDate() + 4 - (target.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
    return Math.ceil(
      ((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
    );
  }

  private assertRdoReadyForFinalDocument(
    rdo: Pick<
      Rdo,
      'status' | 'assinatura_responsavel' | 'assinatura_engenheiro'
    >,
  ) {
    if (rdo.status !== 'aprovado') {
      throw new BadRequestException(
        'Somente RDO aprovado pode receber PDF final governado.',
      );
    }

    if (!rdo.assinatura_responsavel || !rdo.assinatura_engenheiro) {
      throw new BadRequestException(
        'Assinaturas do responsável e do engenheiro são obrigatórias antes da emissão final do RDO.',
      );
    }
  }

  private async assertRdoDocumentMutable(
    rdo: Pick<Rdo, 'id' | 'company_id'>,
  ): Promise<void> {
    const registryEntry = await this.documentRegistryService.findByDocument(
      'rdo',
      rdo.id,
      'pdf',
      rdo.company_id,
    );

    if (registryEntry) {
      throw new BadRequestException(
        'RDO com PDF final emitido está bloqueado para edição. Gere um novo documento para alterar o conteúdo.',
      );
    }
  }
}
