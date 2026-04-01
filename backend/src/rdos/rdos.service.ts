import {
  BadRequestException,
  Inject,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { jsonToExcelBuffer } from '../common/utils/excel.util';
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
import { DocumentMailDispatchResponseDto } from '../mail/dto/document-mail-dispatch-response.dto';
import { DocumentStorageService } from '../common/services/document-storage.service';
import { DocumentGovernanceService } from '../document-registry/document-governance.service';
import { DocumentRegistryService } from '../document-registry/document-registry.service';
import { cleanupUploadedFile } from '../common/storage/storage-compensation.util';
import { WeeklyBundleFilters } from '../common/services/document-bundle.service';
import { RdoAuditService } from './rdo-audit.service';
import { ForensicTrailService } from '../forensic-trail/forensic-trail.service';
import { FORENSIC_EVENT_TYPES } from '../forensic-trail/forensic-trail.constants';
import { SignatureTimestampService } from '../common/services/signature-timestamp.service';
import { DocumentVideosService } from '../document-videos/document-videos.service';
import { RequestContext } from '../common/middleware/request-context.middleware';
import {
  SIGNATURE_LEGAL_ASSURANCE,
  SIGNATURE_PROOF_SCOPES,
  SIGNATURE_VERIFICATION_MODES,
  canonicalizeSignaturePayload,
  hashCanonicalSignaturePayload,
} from '../signatures/signature-proof.util';

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
  verification_mode: 'operational_ack';
  legal_assurance: 'not_legal_strong';
  verification_scope: 'document_integrity_snapshot';
  document_hash_algorithm: 'sha256';
  document_hash: string;
  signature_hash_algorithm: 'sha256';
  signature_hash: string;
  timestamp_token: string;
  timestamp_authority: string;
  canonical_payload_version: 1;
};

@Injectable()
export class RdosService {
  private readonly logger = new Logger(RdosService.name);

  constructor(
    @InjectRepository(Rdo)
    private rdosRepository: Repository<Rdo>,
    private tenantService: TenantService,
    @Inject(forwardRef(() => MailService))
    private mailService: MailService,
    private documentStorageService: DocumentStorageService,
    private documentGovernanceService: DocumentGovernanceService,
    private documentRegistryService: DocumentRegistryService,
    private rdoAuditService: RdoAuditService,
    private readonly forensicTrailService: ForensicTrailService,
    private readonly signatureTimestampService: SignatureTimestampService,
    private readonly documentVideosService: DocumentVideosService,
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

  private isDuplicateNumeroError(error: unknown): boolean {
    if (error instanceof QueryFailedError) {
      const driverError = (
        error as QueryFailedError & { driverError?: unknown }
      ).driverError as
        | {
            code?: string;
            constraint?: string;
            detail?: string;
          }
        | undefined;

      if (driverError?.code === '23505') {
        const constraint = String(
          driverError.constraint || driverError.detail || '',
        ).toLowerCase();
        return constraint.includes('uq_rdos_company_numero');
      }
    }

    const message =
      error instanceof Error
        ? error.message.toLowerCase()
        : typeof error === 'string'
          ? error.toLowerCase()
          : '';

    return (
      message.includes('uq_rdos_company_numero') ||
      message.includes('duplicate key')
    );
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
    return hashCanonicalSignaturePayload(
      this.buildSignatureTrackedSnapshot(rdo),
    );
  }

  private buildOperationalSignatureCanonicalPayload(input: {
    rdo: Pick<
      Rdo,
      | 'id'
      | 'company_id'
      | 'numero'
      | 'status'
      | 'updated_at'
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
    >;
    signerType: 'responsavel' | 'engenheiro';
    signerName: string;
    signerCpf: string;
    signedAt: string;
    actorUserId?: string | null;
  }) {
    return canonicalizeSignaturePayload({
      schema_version: 1,
      verification_mode: SIGNATURE_VERIFICATION_MODES.OPERATIONAL_ACK,
      legal_assurance: SIGNATURE_LEGAL_ASSURANCE.NOT_LEGAL_STRONG,
      document: {
        id: input.rdo.id,
        company_id: input.rdo.company_id,
        numero: input.rdo.numero,
        status: input.rdo.status,
        updated_at: input.rdo.updated_at?.toISOString?.() ?? null,
        proof_scope: SIGNATURE_PROOF_SCOPES.OPERATIONAL_SNAPSHOT,
        snapshot_hash: this.buildSnapshotHash(input.rdo),
      },
      signer: {
        actor_user_id: input.actorUserId || null,
        role: input.signerType,
        name: input.signerName,
        cpf_suffix: input.signerCpf.slice(-4),
      },
      signed_at: input.signedAt,
    });
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
    let saved: Rdo;
    try {
      saved = await this.rdosRepository.save(rdo);
    } catch (error) {
      if (this.isDuplicateNumeroError(error)) {
        throw new BadRequestException(
          'Já existe um RDO com este número na empresa atual.',
        );
      }
      throw error;
    }
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
    const saved = await this.rdosRepository.manager.transaction(
      async (manager) => {
        const transactionalRepository = manager.getRepository(Rdo);
        const persisted = await transactionalRepository.save(rdo);
        await this.forensicTrailService.append(
          {
            eventType: FORENSIC_EVENT_TYPES.DOCUMENT_CANCELED,
            module: 'rdo',
            entityId: persisted.id,
            companyId: persisted.company_id,
            metadata: {
              previousStatus,
              currentStatus: persisted.status,
              reason,
            },
          },
          { manager },
        );
        return persisted;
      },
    );

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
    authenticatedUserId?: string,
  ): Promise<Rdo> {
    const rdo = await this.findOne(id);
    await this.assertRdoDocumentMutable(rdo);
    this.assertRdoNotCancelled(rdo, 'assinado');

    if (rdo.status === 'rascunho') {
      throw new BadRequestException(
        'Envie o RDO para revisão antes de coletar assinaturas.',
      );
    }

    const signedAtIso = new Date().toISOString();
    const canonicalPayload = this.buildOperationalSignatureCanonicalPayload({
      rdo,
      signerType: body.tipo,
      signerName: body.nome.trim(),
      signerCpf: body.cpf.trim(),
      signedAt: signedAtIso,
      actorUserId: authenticatedUserId,
    });
    const documentHash = this.buildSnapshotHash(rdo);
    const signatureHash = hashCanonicalSignaturePayload(canonicalPayload);
    const generatedStamp = this.signatureTimestampService.issueFromHash(
      signatureHash,
      signedAtIso,
    );
    const signaturePayload: RdoOperationalSignature = {
      nome: body.nome.trim(),
      cpf: body.cpf.trim(),
      signed_at: generatedStamp.timestamp_issued_at,
      signature_mode: 'operational_ack',
      verification_mode: SIGNATURE_VERIFICATION_MODES.OPERATIONAL_ACK,
      legal_assurance: SIGNATURE_LEGAL_ASSURANCE.NOT_LEGAL_STRONG,
      verification_scope: 'document_integrity_snapshot',
      document_hash_algorithm: 'sha256',
      document_hash: documentHash,
      signature_hash_algorithm: 'sha256',
      signature_hash: generatedStamp.signature_hash,
      timestamp_token: generatedStamp.timestamp_token,
      timestamp_authority: generatedStamp.timestamp_authority,
      canonical_payload_version: 1,
    };

    const sigData = JSON.stringify(signaturePayload);

    if (body.tipo === 'responsavel') {
      rdo.assinatura_responsavel = sigData;
    } else {
      rdo.assinatura_engenheiro = sigData;
    }

    const saved = await this.rdosRepository.manager.transaction(
      async (manager) => {
        const transactionalRepository = manager.getRepository(Rdo);
        const persisted = await transactionalRepository.save(rdo);
        await this.forensicTrailService.append(
          {
            eventType: FORENSIC_EVENT_TYPES.SIGNATURE_RECORDED,
            module: 'rdo',
            entityId: persisted.id,
            companyId: persisted.company_id,
            userId: authenticatedUserId || null,
            occurredAt: new Date(signaturePayload.signed_at),
            metadata: {
              signatureType: body.tipo,
              verificationMode: signaturePayload.verification_mode,
              signatureMode: signaturePayload.signature_mode,
              signerName: signaturePayload.nome,
              signerCpfSuffix: signaturePayload.cpf.slice(-4),
              documentHash: signaturePayload.document_hash,
              signatureHash: signaturePayload.signature_hash,
              timestampAuthority: signaturePayload.timestamp_authority,
            },
          },
          { manager },
        );
        return persisted;
      },
    );
    this.logRdoEvent('rdo_signed', saved, {
      signatureType: body.tipo,
      verificationMode: signaturePayload.verification_mode,
      signatureMode: signaturePayload.signature_mode,
      documentHash: signaturePayload.document_hash,
      signatureHash: signaturePayload.signature_hash,
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

  async listVideoAttachments(id: string) {
    const rdo = await this.findOne(id);
    return this.documentVideosService.listByDocument({
      companyId: rdo.company_id,
      module: 'rdo',
      documentId: rdo.id,
    });
  }

  async uploadVideoAttachment(
    id: string,
    buffer: Buffer,
    originalName: string,
    mimeType: string,
  ) {
    const rdo = await this.findOne(id);
    await this.assertRdoVideoMutable(rdo);
    const result = await this.documentVideosService.uploadForDocument({
      companyId: rdo.company_id,
      module: 'rdo',
      documentId: rdo.id,
      buffer,
      originalName,
      mimeType,
      uploadedById: RequestContext.getUserId() || undefined,
    });
    this.logRdoEvent('rdo_video_attachment_uploaded', rdo, {
      attachmentId: result.attachment.id,
      mimeType: result.attachment.mime_type,
      storageKey: result.attachment.storage_key,
    });
    return result;
  }

  async getVideoAttachmentAccess(id: string, attachmentId: string) {
    const rdo = await this.findOne(id);
    const result = await this.documentVideosService.getAccess({
      companyId: rdo.company_id,
      module: 'rdo',
      documentId: rdo.id,
      attachmentId,
    });
    this.logRdoEvent('rdo_video_attachment_accessed', rdo, {
      attachmentId,
      availability: result.availability,
    });
    return result;
  }

  async removeVideoAttachment(id: string, attachmentId: string) {
    const rdo = await this.findOne(id);
    await this.assertRdoVideoMutable(rdo);
    const result = await this.documentVideosService.removeFromDocument({
      companyId: rdo.company_id,
      module: 'rdo',
      documentId: rdo.id,
      attachmentId,
      removedById: RequestContext.getUserId() || undefined,
    });
    this.logRdoEvent('rdo_video_attachment_removed', rdo, {
      attachmentId,
    });
    return result;
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

  async sendEmail(
    id: string,
    to: string[],
  ): Promise<DocumentMailDispatchResponseDto & { recipients: number }> {
    const rdo = await this.findOne(id);
    if (!to.length) {
      return {
        success: true,
        message: 'Nenhum destinatário informado para envio do RDO.',
        deliveryMode: 'sent',
        artifactType: 'governed_final_pdf',
        isOfficial: true,
        fallbackUsed: false,
        documentId: rdo.id,
        documentType: 'RDO',
        recipients: 0,
      };
    }
    const access = await this.getPdfAccess(id);
    if (!access.hasFinalPdf) {
      this.logRdoEvent('rdo_email_blocked_without_final_pdf', rdo, {
        recipients: to.length,
      });
      await this.rdoAuditService.recordEvent(rdo.id, 'EMAIL_BLOCKED', {
        recipients: to.length,
        reason: 'missing_final_pdf',
      });
      throw new BadRequestException(
        'Emita o PDF final governado antes de enviar este RDO por e-mail.',
      );
    }

    for (const email of to) {
      await this.mailService.sendStoredDocument(
        rdo.id,
        'RDO',
        email,
        rdo.company_id,
      );
    }

    this.logRdoEvent('rdo_email_sent', rdo, {
      recipients: to.length,
      hasGovernedPdf: true,
      artifactType: 'governed_final_pdf',
      fallbackUsed: false,
    });
    await this.rdoAuditService.recordEvent(rdo.id, 'EMAIL_SENT', {
      recipients: to.length,
      hasGovernedPdf: true,
      artifactType: 'governed_final_pdf',
      fallbackUsed: false,
    });

    return {
      success: true,
      message: `O RDO foi enviado com o PDF final governado para ${to.length} destinatário(s).`,
      deliveryMode: 'sent',
      artifactType: 'governed_final_pdf',
      isOfficial: true,
      fallbackUsed: false,
      documentId: rdo.id,
      documentType: 'RDO',
      recipients: to.length,
    };
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
      trailEventType: FORENSIC_EVENT_TYPES.FINAL_DOCUMENT_REMOVED,
      trailMetadata: {
        removalMode: 'hard_remove',
      },
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

    return jsonToExcelBuffer(rows, 'RDOs');
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
    if (
      typeof this.tenantService.isSuperAdmin === 'function' &&
      this.tenantService.isSuperAdmin()
    ) {
      return;
    }

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

  private async assertRdoVideoMutable(
    rdo: Pick<Rdo, 'id' | 'company_id' | 'status'>,
  ): Promise<void> {
    await this.assertRdoDocumentMutable(rdo);

    if (rdo.status === 'aprovado' || rdo.status === 'cancelado') {
      throw new BadRequestException(
        'RDO aprovado ou cancelado não aceita novos vídeos por fluxo comum.',
      );
    }
  }
}
