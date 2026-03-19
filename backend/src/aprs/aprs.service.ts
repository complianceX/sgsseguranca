import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import { Apr, AprStatus, APR_ALLOWED_TRANSITIONS } from './entities/apr.entity';
import { AprLog } from './entities/apr-log.entity';
import { AprRiskEvidence } from './entities/apr-risk-evidence.entity';
import { AprRiskItem } from './entities/apr-risk-item.entity';
import { TenantService } from '../common/tenant/tenant.service';
import { CreateAprDto } from './dto/create-apr.dto';
import { UpdateAprDto } from './dto/update-apr.dto';
import { Activity } from '../activities/entities/activity.entity';
import { Risk } from '../risks/entities/risk.entity';
import { Epi } from '../epis/entities/epi.entity';
import { Tool } from '../tools/entities/tool.entity';
import { Machine } from '../machines/entities/machine.entity';
import { User } from '../users/entities/user.entity';
import {
  normalizeOffsetPagination,
  OffsetPage,
  toOffsetPage,
} from '../common/utils/offset-pagination.util';
import { plainToClass } from 'class-transformer';
import { AprListItemDto } from './dto/apr-list-item.dto';
import { RiskCalculationService } from '../common/services/risk-calculation.service';
import { WeeklyBundleFilters } from '../common/services/document-bundle.service';
import { DocumentStorageService } from '../common/services/document-storage.service';
import {
  cleanupUploadedFile,
  isS3DisabledUploadError,
} from '../common/storage/storage-compensation.util';
import { DocumentGovernanceService } from '../document-registry/document-governance.service';
import { SignaturesService } from '../signatures/signatures.service';

@Injectable()
export class AprsService {
  private readonly logger = new Logger(AprsService.name);

  constructor(
    @InjectRepository(Apr)
    private aprsRepository: Repository<Apr>,
    @InjectRepository(AprLog)
    private aprLogsRepository: Repository<AprLog>,
    private tenantService: TenantService,
    private readonly riskCalculationService: RiskCalculationService,
    private readonly documentStorageService: DocumentStorageService,
    private readonly documentGovernanceService: DocumentGovernanceService,
    private readonly signaturesService: SignaturesService,
  ) {}

  private assertAprDocumentMutable(apr: Pick<Apr, 'pdf_file_key'>) {
    if (apr.pdf_file_key) {
      throw new BadRequestException(
        'APR assinada anexada. Edição bloqueada. Crie uma nova versão para alterar.',
      );
    }
  }

  private ensureAprStatus(status: string): AprStatus {
    const knownStatuses = Object.values(AprStatus);
    if (knownStatuses.includes(status as AprStatus)) {
      return status as AprStatus;
    }

    throw new BadRequestException(`Status de APR inválido: ${status}`);
  }

  private async assertAprReadyForFinalPdf(
    apr: Pick<
      Apr,
      'id' | 'status' | 'pdf_file_key' | 'is_modelo' | 'participants'
    >,
  ) {
    this.assertAprDocumentMutable(apr);

    if (this.ensureAprStatus(apr.status) !== AprStatus.APROVADA) {
      throw new BadRequestException(
        'A APR precisa estar aprovada antes do anexo do PDF final.',
      );
    }

    if (apr.is_modelo) {
      throw new BadRequestException(
        'Modelos de APR não podem receber PDF final. Gere uma APR operacional a partir do modelo.',
      );
    }

    const participantIds = Array.isArray(apr.participants)
      ? apr.participants
          .map((participant) => participant.id)
          .filter((participantId): participantId is string =>
            Boolean(participantId),
          )
      : [];

    if (participantIds.length === 0) {
      throw new BadRequestException(
        'A APR precisa ter participantes definidos antes do PDF final.',
      );
    }

    const signatures = await this.signaturesService.findByDocument(
      apr.id,
      'APR',
    );
    const participantSigners = new Set(
      signatures
        .map((signature) => signature.user_id)
        .filter(
          (userId): userId is string =>
            Boolean(userId) && participantIds.includes(userId),
        ),
    );

    const missingParticipants = participantIds.filter(
      (participantId) => !participantSigners.has(participantId),
    );

    if (missingParticipants.length > 0) {
      throw new BadRequestException(
        'Todos os participantes precisam assinar a APR antes do PDF final.',
      );
    }
  }

  private buildAprDocumentCode(
    apr: Pick<Apr, 'id' | 'numero' | 'titulo' | 'data_inicio' | 'created_at'>,
  ): string {
    const candidateDate = apr.data_inicio
      ? new Date(apr.data_inicio)
      : apr.created_at
        ? new Date(apr.created_at)
        : new Date();
    const year = Number.isNaN(candidateDate.getTime())
      ? new Date().getFullYear()
      : candidateDate.getFullYear();
    const reference = String(apr.id || apr.numero || apr.titulo || 'APR')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(-8)
      .toUpperCase();

    return `APR-${year}-${reference || String(Date.now()).slice(-6)}`;
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private async addLog(
    aprId: string,
    userId: string | undefined,
    acao: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      const log = this.aprLogsRepository.create({
        apr_id: aprId,
        usuario_id: userId ?? undefined,
        acao,
        metadata: metadata ?? undefined,
      });
      await this.aprLogsRepository.save(log);
    } catch {
      this.logger.warn(`Falha ao gravar log de APR (${aprId}): ${acao}`);
    }
  }

  // ─── CRUD ────────────────────────────────────────────────────────────────────

  async create(createAprDto: CreateAprDto): Promise<Apr> {
    const { activities, risks, epis, tools, machines, participants, ...rest } =
      createAprDto;
    const initialRisk = this.riskCalculationService.calculateScore(
      rest.probability,
      rest.severity,
      rest.exposure,
    );
    const residualRisk =
      rest.residual_risk ||
      this.riskCalculationService.classifyByScore(initialRisk) ||
      null;

    if (rest.is_modelo_padrao) {
      rest.is_modelo = true;
    }

    const apr = this.aprsRepository.create({
      ...rest,
      initial_risk: initialRisk,
      residual_risk: residualRisk,
      control_evidence: Boolean(rest.control_evidence),
      company_id: this.tenantService.getTenantId(),
      activities: activities?.map((id) => ({ id }) as unknown as Activity),
      risks: risks?.map((id) => ({ id }) as unknown as Risk),
      epis: epis?.map((id) => ({ id }) as unknown as Epi),
      tools: tools?.map((id) => ({ id }) as unknown as Tool),
      machines: machines?.map((id) => ({ id }) as unknown as Machine),
      participants: participants?.map((id) => ({ id }) as unknown as User),
    });

    const saved: Apr = await this.aprsRepository.save(apr);
    if (saved.is_modelo_padrao) {
      await this.aprsRepository.update(
        { company_id: saved.company_id },
        { is_modelo_padrao: false },
      );
      await this.aprsRepository.update(
        { id: saved.id },
        { is_modelo_padrao: true, is_modelo: true },
      );
    }
    this.logger.log({
      event: 'apr_created',
      aprId: saved.id,
      companyId: saved.company_id,
    });
    return saved;
  }

  async findAll(): Promise<Apr[]> {
    const tenantId = this.tenantService.getTenantId();
    return this.aprsRepository.find({
      where: tenantId ? { company_id: tenantId } : {},
      relations: [
        'company',
        'site',
        'elaborador',
        'activities',
        'risks',
        'epis',
        'tools',
        'machines',
        'participants',
        'auditado_por',
      ],
    });
  }

  async findPaginated(opts?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    companyId?: string;
    isModeloPadrao?: boolean;
  }): Promise<OffsetPage<AprListItemDto>> {
    const tenantId = this.tenantService.getTenantId();
    const { page, limit, skip } = normalizeOffsetPagination(opts, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const qb = this.aprsRepository
      .createQueryBuilder('apr')
      .select([
        'apr.id',
        'apr.numero',
        'apr.titulo',
        'apr.descricao',
        'apr.data_inicio',
        'apr.data_fim',
        'apr.status',
        'apr.versao',
        'apr.is_modelo',
        'apr.is_modelo_padrao',
        'apr.company_id',
        'apr.classificacao_resumo',
        'apr.created_at',
      ])
      .orderBy('apr.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (tenantId) {
      qb.where('apr.company_id = :tenantId', { tenantId });
    } else if (opts?.companyId) {
      qb.where('apr.company_id = :companyId', { companyId: opts.companyId });
    }
    if (opts?.search) {
      const clause = 'apr.titulo ILIKE :search';
      if (tenantId || opts?.companyId) {
        qb.andWhere(clause, { search: `%${opts.search}%` });
      } else {
        qb.where(clause, { search: `%${opts.search}%` });
      }
    }
    if (opts?.status) {
      qb.andWhere('apr.status = :status', { status: opts.status });
    }
    if (opts?.isModeloPadrao !== undefined) {
      qb.andWhere('apr.is_modelo_padrao = :isModeloPadrao', {
        isModeloPadrao: opts.isModeloPadrao,
      });
    }

    const [rows, total] = await qb.getManyAndCount();
    const data = rows.map((r) => plainToClass(AprListItemDto, r));
    return toOffsetPage(data, total, page, limit);
  }

  async findOne(id: string): Promise<Apr> {
    const tenantId = this.tenantService.getTenantId();
    const apr = await this.aprsRepository.findOne({
      where: tenantId ? { id, company_id: tenantId } : { id },
      relations: [
        'company',
        'site',
        'elaborador',
        'activities',
        'risks',
        'epis',
        'tools',
        'machines',
        'participants',
        'auditado_por',
      ],
    });
    if (!apr) {
      throw new NotFoundException(`APR com ID ${id} não encontrada`);
    }
    return apr;
  }

  /** Busca sem eager-load de relações — usar em operações de escrita (approve, reject, update...) */
  private async findOneForWrite(id: string): Promise<Apr> {
    const tenantId = this.tenantService.getTenantId();
    const apr = await this.aprsRepository.findOne({
      where: tenantId ? { id, company_id: tenantId } : { id },
    });
    if (!apr) {
      throw new NotFoundException(`APR com ID ${id} não encontrada`);
    }
    return apr;
  }

  async update(id: string, updateAprDto: UpdateAprDto): Promise<Apr> {
    if ('status' in updateAprDto && updateAprDto.status !== undefined) {
      throw new BadRequestException(
        'Use os endpoints /approve, /reject ou /finalize para alterar o status da APR.',
      );
    }
    const apr = await this.findOneForWrite(id);
    this.assertAprDocumentMutable(apr);
    const { activities, risks, epis, tools, machines, participants, ...rest } =
      updateAprDto;

    const next = { ...rest };
    if (next.is_modelo_padrao) next.is_modelo = true;
    if (next.is_modelo === false) next.is_modelo_padrao = false;

    const initialRisk = this.riskCalculationService.calculateScore(
      next.probability ?? apr.probability,
      next.severity ?? apr.severity,
      next.exposure ?? apr.exposure,
    );
    const residualRisk =
      next.residual_risk ||
      this.riskCalculationService.classifyByScore(initialRisk) ||
      apr.residual_risk ||
      null;

    Object.assign(apr, {
      ...next,
      initial_risk: initialRisk,
      residual_risk: residualRisk,
      control_evidence:
        next.control_evidence !== undefined
          ? Boolean(next.control_evidence)
          : Boolean(apr.control_evidence),
    });

    if (activities)
      apr.activities = activities.map((id) => ({ id }) as unknown as Activity);
    if (risks) apr.risks = risks.map((id) => ({ id }) as unknown as Risk);
    if (epis) apr.epis = epis.map((id) => ({ id }) as unknown as Epi);
    if (tools) apr.tools = tools.map((id) => ({ id }) as unknown as Tool);
    if (machines)
      apr.machines = machines.map((id) => ({ id }) as unknown as Machine);
    if (participants)
      apr.participants = participants.map((id) => ({ id }) as unknown as User);

    const saved = await this.aprsRepository.save(apr);
    if (saved.is_modelo_padrao) {
      await this.aprsRepository.update(
        { company_id: saved.company_id },
        { is_modelo_padrao: false },
      );
      await this.aprsRepository.update(
        { id: saved.id },
        { is_modelo_padrao: true, is_modelo: true },
      );
    }
    this.logger.log({
      event: 'apr_updated',
      aprId: saved.id,
      companyId: saved.company_id,
    });
    return saved;
  }

  async remove(id: string, userId?: string): Promise<void> {
    const apr = await this.findOneForWrite(id);
    await this.documentGovernanceService.removeFinalDocumentReference({
      companyId: apr.company_id,
      module: 'apr',
      entityId: apr.id,
      removeEntityState: async (manager) => {
        await manager.getRepository(Apr).softDelete(id);
      },
      cleanupStoredFile: (fileKey) =>
        this.documentStorageService.deleteFile(fileKey),
    });
    await this.addLog(id, userId, 'removido', { companyId: apr.company_id });
    this.logger.log({
      event: 'apr_soft_deleted',
      aprId: apr.id,
      companyId: apr.company_id,
    });
  }

  // ─── Workflow ────────────────────────────────────────────────────────────────

  async approve(id: string, userId: string, reason?: string): Promise<Apr> {
    const apr = await this.findOneForWrite(id);
    const currentStatus = this.ensureAprStatus(apr.status);
    const allowed = APR_ALLOWED_TRANSITIONS[currentStatus];
    if (!allowed?.includes(AprStatus.APROVADA)) {
      throw new BadRequestException(
        `Transição inválida: ${currentStatus} → Aprovada. Permitidas: ${allowed?.join(', ') || 'nenhuma'}`,
      );
    }
    apr.status = AprStatus.APROVADA;
    apr.aprovado_por_id = userId;
    apr.aprovado_em = new Date();
    if (reason) apr.aprovado_motivo = reason;
    const saved = await this.aprsRepository.save(apr);
    await this.addLog(id, userId, 'aprovado', { motivo: reason });
    this.logger.log({ event: 'apr_approved', aprId: id, userId });
    return saved;
  }

  async reject(id: string, userId: string, reason: string): Promise<Apr> {
    const apr = await this.findOneForWrite(id);
    const currentStatus = this.ensureAprStatus(apr.status);
    const allowed = APR_ALLOWED_TRANSITIONS[currentStatus];
    if (!allowed?.includes(AprStatus.CANCELADA)) {
      throw new BadRequestException(
        `Transição inválida: ${currentStatus} → Cancelada. Permitidas: ${allowed?.join(', ') || 'nenhuma'}`,
      );
    }
    apr.status = AprStatus.CANCELADA;
    apr.reprovado_por_id = userId;
    apr.reprovado_em = new Date();
    apr.reprovado_motivo = reason;
    const saved = await this.aprsRepository.save(apr);
    await this.addLog(id, userId, 'reprovado', { motivo: reason });
    this.logger.log({ event: 'apr_rejected', aprId: id, userId });
    return saved;
  }

  async finalize(id: string, userId: string): Promise<Apr> {
    const apr = await this.findOneForWrite(id);
    const currentStatus = this.ensureAprStatus(apr.status);
    const allowed = APR_ALLOWED_TRANSITIONS[currentStatus];
    if (!allowed?.includes(AprStatus.ENCERRADA)) {
      throw new BadRequestException(
        `Transição inválida: ${currentStatus} → Encerrada. Permitidas: ${allowed?.join(', ') || 'nenhuma'}`,
      );
    }
    apr.status = AprStatus.ENCERRADA;
    const saved = await this.aprsRepository.save(apr);
    await this.addLog(id, userId, 'encerrado');
    this.logger.log({ event: 'apr_finalized', aprId: id, userId });
    return saved;
  }

  async createNewVersion(id: string, userId: string): Promise<Apr> {
    const original = await this.findOneForWrite(id);
    if (this.ensureAprStatus(original.status) !== AprStatus.APROVADA) {
      throw new BadRequestException(
        `Somente APRs Aprovadas podem gerar nova versão. Status atual: ${original.status}`,
      );
    }

    const rootId = original.parent_apr_id ?? original.id;
    const maxVersionRow = await this.aprsRepository
      .createQueryBuilder('apr')
      .select('MAX(apr.versao)', 'max')
      .where('(apr.id = :rootId OR apr.parent_apr_id = :rootId)', { rootId })
      .getRawOne<{ max: string }>();
    const nextVersion = Number(maxVersionRow?.max ?? original.versao) + 1;

    const novo = this.aprsRepository.create({
      titulo: original.titulo,
      descricao: original.descricao,
      data_inicio: original.data_inicio,
      data_fim: original.data_fim,
      status: AprStatus.PENDENTE,
      is_modelo: original.is_modelo,
      is_modelo_padrao: false,
      probability: original.probability,
      severity: original.severity,
      exposure: original.exposure,
      initial_risk: original.initial_risk,
      residual_risk: original.residual_risk,
      control_description: original.control_description,
      control_evidence: original.control_evidence,
      company_id: original.company_id,
      site_id: original.site_id,
      elaborador_id: userId,
      versao: nextVersion,
      parent_apr_id: rootId,
      numero: `${original.numero}-v${nextVersion}`,
    });

    const saved = await this.aprsRepository.save(novo);
    await this.addLog(id, userId, 'nova_versao_criada', {
      novaAprId: saved.id,
      versao: nextVersion,
    });
    this.logger.log({
      event: 'apr_new_version',
      originalId: id,
      newId: saved.id,
      versao: nextVersion,
    });
    return saved;
  }

  // ─── PDF Storage ─────────────────────────────────────────────────────────────

  async attachPdf(
    id: string,
    file: Express.Multer.File,
    userId?: string,
  ): Promise<{ fileKey: string; folderPath: string; originalName: string }> {
    const apr = await this.findOne(id);
    await this.assertAprReadyForFinalPdf(apr);
    const key = this.documentStorageService.generateDocumentKey(
      apr.company_id,
      'aprs',
      id,
      file.originalname,
    );
    let uploadedToStorage = false;

    try {
      await this.documentStorageService.uploadFile(
        key,
        file.buffer,
        file.mimetype,
      );
      uploadedToStorage = true;
    } catch (error) {
      if (!isS3DisabledUploadError(error)) {
        throw error;
      }
      this.logger.warn(`S3 desabilitado, armazenando referência local: ${key}`);
    }

    const folder = `aprs/${apr.company_id}`;
    try {
      await this.documentGovernanceService.registerFinalDocument({
        companyId: apr.company_id,
        module: 'apr',
        entityId: apr.id,
        title: apr.titulo || apr.numero || 'APR',
        documentDate: apr.data_inicio || apr.created_at,
        documentCode: this.buildAprDocumentCode(apr),
        fileKey: key,
        folderPath: folder,
        originalName: file.originalname,
        mimeType: file.mimetype,
        createdBy: userId,
        fileBuffer: file.buffer,
        persistEntityMetadata: async (manager) => {
          await manager.getRepository(Apr).update(id, {
            pdf_file_key: key,
            pdf_folder_path: folder,
            pdf_original_name: file.originalname,
          });
        },
      });
    } catch (error) {
      if (uploadedToStorage) {
        await cleanupUploadedFile(
          this.logger,
          `apr:${apr.id}`,
          key,
          (fileKey) => this.documentStorageService.deleteFile(fileKey),
        );
      }
      throw error;
    }
    await this.addLog(id, userId, 'pdf_anexado', { fileKey: key });

    return {
      fileKey: key,
      folderPath: folder,
      originalName: file.originalname,
    };
  }

  async uploadRiskEvidence(
    aprId: string,
    riskItemId: string,
    file: Express.Multer.File,
    metadata: {
      captured_at?: string;
      latitude?: number;
      longitude?: number;
      accuracy_m?: number;
      device_id?: string;
      exif_datetime?: string;
    },
    userId?: string,
    ipAddress?: string,
  ): Promise<{
    id: string;
    fileKey: string;
    originalName: string;
    hashSha256: string;
  }> {
    const apr = await this.findOneForWrite(aprId);
    this.assertAprDocumentMutable(apr);

    const riskItem = await this.aprsRepository.manager
      .getRepository(AprRiskItem)
      .findOne({
        where: {
          id: riskItemId,
          apr_id: aprId,
        },
      });

    if (!riskItem) {
      throw new NotFoundException(
        `Item de risco ${riskItemId} não encontrado para a APR ${aprId}.`,
      );
    }

    const parseOptionalDate = (value?: string): Date | null => {
      if (!value?.trim()) return null;
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    const originalName =
      file.originalname?.trim() || `apr-evidence-${Date.now()}.jpg`;
    const fileKey = this.documentStorageService.generateDocumentKey(
      apr.company_id,
      'apr-evidences',
      apr.id,
      originalName,
    );
    const hashSha256 = createHash('sha256').update(file.buffer).digest('hex');

    await this.documentStorageService.uploadFile(
      fileKey,
      file.buffer,
      file.mimetype,
    );

    try {
      const evidenceRepository =
        this.aprsRepository.manager.getRepository(AprRiskEvidence);
      const evidence = evidenceRepository.create({
        apr_id: apr.id,
        apr_risk_item_id: riskItem.id,
        uploaded_by_id: userId ?? null,
        file_key: fileKey,
        original_name: originalName,
        mime_type: file.mimetype,
        file_size_bytes: file.size || file.buffer.length,
        hash_sha256: hashSha256,
        watermarked_file_key: null,
        watermarked_hash_sha256: null,
        watermark_text: null,
        captured_at: parseOptionalDate(metadata.captured_at),
        latitude:
          typeof metadata.latitude === 'number' ? metadata.latitude : null,
        longitude:
          typeof metadata.longitude === 'number' ? metadata.longitude : null,
        accuracy_m:
          typeof metadata.accuracy_m === 'number' ? metadata.accuracy_m : null,
        device_id: metadata.device_id?.trim() || null,
        ip_address: ipAddress || null,
        exif_datetime: parseOptionalDate(metadata.exif_datetime),
        integrity_flags: {
          gps:
            typeof metadata.latitude === 'number' &&
            typeof metadata.longitude === 'number',
          accuracy:
            typeof metadata.accuracy_m === 'number' &&
            Number.isFinite(metadata.accuracy_m),
          device: Boolean(metadata.device_id),
          ip: Boolean(ipAddress),
          exif: Boolean(metadata.exif_datetime),
        },
      });

      const saved = await evidenceRepository.save(evidence);
      await this.addLog(apr.id, userId, 'evidencia_enviada', {
        evidenceId: saved.id,
        riskItemId: riskItem.id,
        fileKey,
        hashSha256,
      });

      return {
        id: saved.id,
        fileKey,
        originalName,
        hashSha256,
      };
    } catch (error) {
      await cleanupUploadedFile(
        this.logger,
        `apr-evidence:${apr.id}`,
        fileKey,
        (key) => this.documentStorageService.deleteFile(key),
      );
      throw error;
    }
  }

  async verifyEvidenceByHashPublic(hash: string): Promise<{
    verified: boolean;
    matchedIn?: 'original' | 'watermarked';
    message?: string;
    evidence?: {
      apr_numero?: string;
      apr_versao?: number;
      risk_item_ordem?: number;
      uploaded_at?: string;
      original_hash?: string;
      watermarked_hash?: string | null;
      integrity_flags?: Record<string, unknown> | null;
    };
  }> {
    const normalizedHash = String(hash || '')
      .trim()
      .toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(normalizedHash)) {
      return {
        verified: false,
        message: 'Hash SHA-256 inválido.',
      };
    }

    const evidence = await this.aprsRepository.manager
      .getRepository(AprRiskEvidence)
      .findOne({
        where: [
          { hash_sha256: normalizedHash },
          { watermarked_hash_sha256: normalizedHash },
        ],
        relations: ['apr', 'apr_risk_item'],
      });

    if (!evidence) {
      return {
        verified: false,
        message: 'Hash não localizado na base de evidências da APR.',
      };
    }

    return {
      verified: true,
      matchedIn:
        evidence.hash_sha256 === normalizedHash ? 'original' : 'watermarked',
      evidence: {
        apr_numero: evidence.apr?.numero,
        apr_versao: evidence.apr?.versao,
        risk_item_ordem: evidence.apr_risk_item?.ordem,
        uploaded_at: evidence.uploaded_at?.toISOString(),
        original_hash: evidence.hash_sha256,
        watermarked_hash: evidence.watermarked_hash_sha256,
        integrity_flags: evidence.integrity_flags,
      },
    };
  }

  async listAprEvidences(id: string) {
    await this.findOneForWrite(id);

    const evidences = await this.aprsRepository.manager
      .getRepository(AprRiskEvidence)
      .find({
        where: { apr_id: id },
        relations: ['apr_risk_item', 'uploaded_by'],
        order: { uploaded_at: 'DESC' },
      });

    return Promise.all(
      evidences.map(async (evidence) => {
        let url: string | undefined;
        let watermarkedUrl: string | undefined;

        try {
          url = await this.documentStorageService.getSignedUrl(
            evidence.file_key,
            3600,
          );
        } catch {
          url = undefined;
        }

        if (evidence.watermarked_file_key) {
          try {
            watermarkedUrl = await this.documentStorageService.getSignedUrl(
              evidence.watermarked_file_key,
              3600,
            );
          } catch {
            watermarkedUrl = undefined;
          }
        }

        return {
          id: evidence.id,
          apr_id: evidence.apr_id,
          apr_risk_item_id: evidence.apr_risk_item_id,
          uploaded_by_id: evidence.uploaded_by_id ?? undefined,
          uploaded_by_name: evidence.uploaded_by?.nome ?? undefined,
          file_key: evidence.file_key,
          original_name: evidence.original_name ?? undefined,
          mime_type: evidence.mime_type,
          file_size_bytes: evidence.file_size_bytes,
          hash_sha256: evidence.hash_sha256,
          watermarked_file_key: evidence.watermarked_file_key ?? undefined,
          watermarked_hash_sha256:
            evidence.watermarked_hash_sha256 ?? undefined,
          watermark_text: evidence.watermark_text ?? undefined,
          captured_at: evidence.captured_at?.toISOString(),
          uploaded_at: evidence.uploaded_at?.toISOString(),
          latitude:
            evidence.latitude !== null && evidence.latitude !== undefined
              ? Number(evidence.latitude)
              : undefined,
          longitude:
            evidence.longitude !== null && evidence.longitude !== undefined
              ? Number(evidence.longitude)
              : undefined,
          accuracy_m:
            evidence.accuracy_m !== null && evidence.accuracy_m !== undefined
              ? Number(evidence.accuracy_m)
              : undefined,
          device_id: evidence.device_id ?? undefined,
          ip_address: evidence.ip_address ?? undefined,
          exif_datetime: evidence.exif_datetime?.toISOString(),
          integrity_flags: evidence.integrity_flags ?? undefined,
          risk_item_ordem: evidence.apr_risk_item?.ordem ?? undefined,
          url,
          watermarked_url: watermarkedUrl,
        };
      }),
    );
  }

  async getPdfAccess(id: string): Promise<{
    entityId: string;
    fileKey: string;
    folderPath: string;
    originalName: string;
    url: string | null;
  }> {
    const apr = await this.findOneForWrite(id);
    if (!apr.pdf_file_key) {
      throw new NotFoundException(`APR ${id} não possui PDF armazenado`);
    }

    let url: string | null = null;
    try {
      url = await this.documentStorageService.getSignedUrl(
        apr.pdf_file_key,
        3600,
      );
    } catch {
      url = null;
    }

    return {
      entityId: apr.id,
      fileKey: apr.pdf_file_key,
      folderPath: apr.pdf_folder_path,
      originalName: apr.pdf_original_name,
      url,
    };
  }

  // ─── Logs & History ──────────────────────────────────────────────────────────

  async getLogs(id: string): Promise<AprLog[]> {
    await this.findOneForWrite(id);
    return this.aprLogsRepository.find({
      where: { apr_id: id },
      order: { data_hora: 'DESC' },
    });
  }

  async getVersionHistory(id: string): Promise<Apr[]> {
    const apr = await this.findOneForWrite(id);
    const rootId = apr.parent_apr_id ?? apr.id;
    const tenantId = this.tenantService.getTenantId();

    const qb = this.aprsRepository
      .createQueryBuilder('apr')
      .select([
        'apr.id',
        'apr.numero',
        'apr.versao',
        'apr.status',
        'apr.parent_apr_id',
        'apr.aprovado_em',
        'apr.updated_at',
        'apr.classificacao_resumo',
      ])
      .where('(apr.id = :rootId OR apr.parent_apr_id = :rootId)', { rootId })
      .orderBy('apr.versao', 'ASC');

    if (tenantId) qb.andWhere('apr.company_id = :tenantId', { tenantId });

    return qb.getMany();
  }

  // ─── Analytics ────────────────────────────────────────────────────────────────

  async getAnalyticsOverview(): Promise<{
    totalAprs: number;
    aprovadas: number;
    pendentes: number;
    riscosCriticos: number;
    mediaScoreRisco: number;
  }> {
    const tenantId = this.tenantService.getTenantId();
    const baseWhere: FindOptionsWhere<Apr> = tenantId
      ? { company_id: tenantId }
      : {};
    const approvedWhere: FindOptionsWhere<Apr> = {
      ...baseWhere,
      status: AprStatus.APROVADA,
    };
    const pendingWhere: FindOptionsWhere<Apr> = {
      ...baseWhere,
      status: AprStatus.PENDENTE,
    };

    const [totalAprs, aprovadas, pendentes] = await Promise.all([
      this.aprsRepository.count({ where: baseWhere }),
      this.aprsRepository.count({
        where: approvedWhere,
      }),
      this.aprsRepository.count({
        where: pendingWhere,
      }),
    ]);

    const riskQb = this.aprsRepository
      .createQueryBuilder('apr')
      .innerJoin('apr.risk_items', 'ri')
      .select('AVG(ri.score_risco)', 'avg')
      .addSelect(
        `COUNT(CASE WHEN UPPER(ri.categoria_risco) IN ('CRÍTICO', 'CRITICO') THEN 1 END)`,
        'criticos',
      );

    if (tenantId) riskQb.where('apr.company_id = :tenantId', { tenantId });

    const riskStats = await riskQb.getRawOne<{
      avg: string;
      criticos: string;
    }>();

    return {
      totalAprs,
      aprovadas,
      pendentes,
      riscosCriticos: Number(riskStats?.criticos ?? 0),
      mediaScoreRisco: Math.round(Number(riskStats?.avg ?? 0)),
    };
  }

  // ─── Misc ────────────────────────────────────────────────────────────────────

  async count(options?: { where?: Record<string, unknown> }): Promise<number> {
    const tenantId = this.tenantService.getTenantId();
    const where = options?.where || {};
    return this.aprsRepository.count({
      where: tenantId
        ? ({ ...where, company_id: tenantId } as Record<string, unknown>)
        : where,
    });
  }

  async listStoredFiles(filters: WeeklyBundleFilters) {
    return this.documentGovernanceService.listFinalDocuments('apr', filters);
  }

  async getWeeklyBundle(filters: WeeklyBundleFilters) {
    return this.documentGovernanceService.getModuleWeeklyBundle(
      'apr',
      'APR',
      filters,
    );
  }

  async exportExcel(): Promise<Buffer> {
    const tenantId = this.tenantService.getTenantId();
    const qb = this.aprsRepository
      .createQueryBuilder('apr')
      .select([
        'apr.numero',
        'apr.titulo',
        'apr.status',
        'apr.data_inicio',
        'apr.data_fim',
        'apr.versao',
        'apr.created_at',
      ])
      .orderBy('apr.created_at', 'DESC');
    if (tenantId) qb.where('apr.company_id = :tenantId', { tenantId });
    const aprs = await qb.getMany();

    const rows = aprs.map((a) => ({
      Número: a.numero,
      Título: a.titulo,
      Status: a.status,
      'Data Início': a.data_inicio
        ? new Date(a.data_inicio).toLocaleDateString('pt-BR')
        : '',
      'Data Fim': a.data_fim
        ? new Date(a.data_fim).toLocaleDateString('pt-BR')
        : '',
      Versão: a.versao ?? 1,
      'Criado em': new Date(a.created_at).toLocaleDateString('pt-BR'),
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'APRs');
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }

  async getRiskMatrix(siteId?: string): Promise<{
    matrix: { categoria: string; prob: number; sev: number; count: number }[];
  }> {
    const tenantId = this.tenantService.getTenantId();
    const qb = this.aprsRepository
      .createQueryBuilder('apr')
      .innerJoin('apr.risk_items', 'ri')
      .select('ri.categoria_risco', 'categoria')
      .addSelect('ri.probabilidade', 'prob')
      .addSelect('ri.severidade', 'sev')
      .addSelect('COUNT(*)', 'count')
      .where('ri.probabilidade IS NOT NULL')
      .andWhere('ri.severidade IS NOT NULL')
      .groupBy('ri.categoria_risco')
      .addGroupBy('ri.probabilidade')
      .addGroupBy('ri.severidade');

    if (tenantId) qb.andWhere('apr.company_id = :tenantId', { tenantId });
    if (siteId) qb.andWhere('apr.site_id = :siteId', { siteId });

    const raw = await qb.getRawMany<{
      categoria: string;
      prob: string | number;
      sev: string | number;
      count: string | number;
    }>();
    return {
      matrix: raw.map((r) => ({
        categoria: r.categoria,
        prob: Number(r.prob),
        sev: Number(r.sev),
        count: Number(r.count),
      })),
    };
  }

  getControlSuggestions(payload: {
    probability?: number;
    severity?: number;
    exposure?: number;
    activity?: string;
    condition?: string;
  }) {
    const score = this.riskCalculationService.calculateScore(
      payload.probability,
      payload.severity,
      payload.exposure,
    );
    const riskLevel = this.riskCalculationService.classifyByScore(score);
    return {
      score,
      riskLevel,
      suggestions: this.riskCalculationService.suggestControls({
        riskLevel,
        activity: payload.activity,
        condition: payload.condition,
      }),
    };
  }
}
