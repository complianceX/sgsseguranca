import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, FindOptionsWhere, In, Repository } from 'typeorm';
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
import { cleanupUploadedFile } from '../common/storage/storage-compensation.util';
import { DocumentGovernanceService } from '../document-registry/document-governance.service';
import { SignaturesService } from '../signatures/signatures.service';
import { Site } from '../sites/entities/site.entity';
import {
  AprRiskCategory,
  AprRiskMatrixService,
} from './apr-risk-matrix.service';
import { AprRiskItemInputDto } from './dto/apr-risk-item-input.dto';
import { AprExcelService } from './apr-excel.service';
import { AprExcelImportPreviewDto } from './dto/apr-excel-import-preview.dto';
import { ForensicTrailService } from '../forensic-trail/forensic-trail.service';
import { FORENSIC_EVENT_TYPES } from '../forensic-trail/forensic-trail.constants';

const APR_LOG_ACTIONS = {
  CREATED: 'APR_CRIADA',
  UPDATED: 'APR_ATUALIZADA',
  APPROVED: 'APR_APROVADA',
  REJECTED: 'APR_REPROVADA',
  FINALIZED: 'APR_ENCERRADA',
  PDF_ATTACHED: 'APR_PDF_ANEXADO',
  NEW_VERSION_GENERATED: 'APR_NOVA_VERSAO_GERADA',
  CREATED_FROM_VERSION: 'APR_CRIADA_POR_VERSAO',
  EVIDENCE_ATTACHED: 'APR_EVIDENCIA_ENVIADA',
  REMOVED: 'APR_REMOVIDA',
} as const;

type AprLogAction = (typeof APR_LOG_ACTIONS)[keyof typeof APR_LOG_ACTIONS];
type AprPdfAccessAvailability =
  | 'ready'
  | 'registered_without_signed_url'
  | 'not_emitted';

type AprRiskItemSnapshot = {
  atividade: string | null;
  agente_ambiental: string | null;
  condicao_perigosa: string | null;
  fonte_circunstancia: string | null;
  lesao: string | null;
  probabilidade: number | null;
  severidade: number | null;
  score_risco: number | null;
  categoria_risco: AprRiskCategory | null;
  prioridade: string | null;
  medidas_prevencao: string | null;
  responsavel: string | null;
  prazo: string | null;
  status_acao: string | null;
  ordem: number;
};

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
    private readonly aprRiskMatrixService: AprRiskMatrixService,
    private readonly aprExcelService: AprExcelService,
    private readonly documentStorageService: DocumentStorageService,
    private readonly documentGovernanceService: DocumentGovernanceService,
    private readonly signaturesService: SignaturesService,
    private readonly forensicTrailService: ForensicTrailService,
  ) {}

  private assertAprDocumentMutable(apr: Pick<Apr, 'pdf_file_key'>) {
    if (apr.pdf_file_key) {
      throw new BadRequestException(
        'APR assinada anexada. Edição bloqueada. Crie uma nova versão para alterar.',
      );
    }
  }

  private assertAprEditableStatus(status: string) {
    if (this.ensureAprStatus(status) !== AprStatus.PENDENTE) {
      throw new BadRequestException(
        'Somente APRs pendentes podem ser editadas pelo formulário. Use os fluxos formais de aprovação, cancelamento, encerramento ou nova versão.',
      );
    }
  }

  private assertAprFormMutable(
    apr: Pick<Apr, 'status' | 'pdf_file_key'>,
  ): void {
    this.assertAprDocumentMutable(apr);
    this.assertAprEditableStatus(apr.status);
  }

  private assertAprWorkflowTransitionAllowed(
    apr: Pick<Apr, 'pdf_file_key'>,
  ): void {
    if (apr.pdf_file_key) {
      throw new BadRequestException(
        'APR com PDF final emitido está bloqueada para mudança de status. Gere uma nova versão para seguir com alterações.',
      );
    }
  }

  private assertAprRemovable(apr: Pick<Apr, 'status' | 'pdf_file_key'>): void {
    if (apr.pdf_file_key) {
      throw new BadRequestException(
        'APR com PDF final emitido não pode ser removida. Use a governança documental ou gere nova versão quando aplicável.',
      );
    }

    if (this.ensureAprStatus(apr.status) !== AprStatus.PENDENTE) {
      throw new BadRequestException(
        'Somente APRs pendentes e sem PDF final podem ser removidas. Use os fluxos formais de cancelamento/encerramento para registros fechados.',
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
    acao: AprLogAction,
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

  private normalizeAprRiskText(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const sanitized = value.trim();
    return sanitized ? sanitized : null;
  }

  private normalizeAprRiskNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  private toLegacyRiskItemPayload(
    items: AprRiskItemSnapshot[],
  ): Array<Record<string, string>> {
    return items.map((item) => ({
      atividade_processo: item.atividade ?? '',
      agente_ambiental: item.agente_ambiental ?? '',
      condicao_perigosa: item.condicao_perigosa ?? '',
      fontes_circunstancias: item.fonte_circunstancia ?? '',
      possiveis_lesoes: item.lesao ?? '',
      probabilidade:
        item.probabilidade !== null && item.probabilidade !== undefined
          ? String(item.probabilidade)
          : '',
      severidade:
        item.severidade !== null && item.severidade !== undefined
          ? String(item.severidade)
          : '',
      categoria_risco: item.categoria_risco ?? '',
      medidas_prevencao: item.medidas_prevencao ?? '',
      responsavel: item.responsavel ?? '',
      prazo: item.prazo ?? '',
      status_acao: item.status_acao ?? '',
    }));
  }

  private normalizeAprRiskItemInput(
    item: Partial<AprRiskItemInputDto & Record<string, unknown>>,
    index: number,
  ): AprRiskItemSnapshot {
    const probabilidade = this.normalizeAprRiskNumber(item.probabilidade);
    const severidade = this.normalizeAprRiskNumber(item.severidade);
    const evaluation = this.aprRiskMatrixService.evaluate(
      probabilidade,
      severidade,
    );

    return {
      atividade: this.normalizeAprRiskText(
        item.atividade_processo ?? item.atividade,
      ),
      agente_ambiental: this.normalizeAprRiskText(item.agente_ambiental),
      condicao_perigosa: this.normalizeAprRiskText(item.condicao_perigosa),
      fonte_circunstancia: this.normalizeAprRiskText(
        item.fonte_circunstancia ?? item.fontes_circunstancias,
      ),
      lesao: this.normalizeAprRiskText(item.possiveis_lesoes ?? item.lesao),
      probabilidade,
      severidade,
      score_risco: evaluation.score,
      categoria_risco: evaluation.categoria,
      prioridade: evaluation.prioridade,
      medidas_prevencao: this.normalizeAprRiskText(item.medidas_prevencao),
      responsavel: this.normalizeAprRiskText(item.responsavel),
      prazo: this.normalizeAprRiskText(item.prazo),
      status_acao: this.normalizeAprRiskText(item.status_acao),
      ordem: index,
    };
  }

  private buildAprRiskItemSnapshots(input: {
    itens_risco?: Array<Record<string, unknown>>;
    risk_items?: AprRiskItemInputDto[];
  }): AprRiskItemSnapshot[] {
    const source: Array<
      Partial<AprRiskItemInputDto & Record<string, unknown>>
    > = Array.isArray(input.risk_items)
      ? input.risk_items.map((item) => ({
          ...item,
        }))
      : Array.isArray(input.itens_risco)
        ? input.itens_risco
        : [];

    return source.map((item, index) =>
      this.normalizeAprRiskItemInput(item, index),
    );
  }

  private buildAprClassificationSummary(items: AprRiskItemSnapshot[]) {
    return this.aprRiskMatrixService.summarize(
      items.map((item) => item.categoria_risco),
    );
  }

  private mapPersistedRiskItemToSnapshot(
    item: AprRiskItem,
  ): AprRiskItemSnapshot {
    return {
      atividade: item.atividade,
      agente_ambiental: item.agente_ambiental,
      condicao_perigosa: item.condicao_perigosa,
      fonte_circunstancia: item.fonte_circunstancia,
      lesao: item.lesao,
      probabilidade: item.probabilidade,
      severidade: item.severidade,
      score_risco: item.score_risco,
      categoria_risco: this.aprRiskMatrixService.normalizeCategory(
        item.categoria_risco,
      ),
      prioridade: item.prioridade,
      medidas_prevencao: item.medidas_prevencao,
      responsavel: item.responsavel,
      prazo: item.prazo ? item.prazo.toISOString().slice(0, 10) : null,
      status_acao: item.status_acao,
      ordem: item.ordem,
    };
  }

  private hasRiskItemChanged(
    existing: AprRiskItem,
    next: AprRiskItemSnapshot,
  ): boolean {
    return (
      existing.atividade !== next.atividade ||
      existing.agente_ambiental !== next.agente_ambiental ||
      existing.condicao_perigosa !== next.condicao_perigosa ||
      existing.fonte_circunstancia !== next.fonte_circunstancia ||
      existing.lesao !== next.lesao ||
      existing.probabilidade !== next.probabilidade ||
      existing.severidade !== next.severidade ||
      existing.score_risco !== next.score_risco ||
      existing.categoria_risco !== next.categoria_risco ||
      existing.prioridade !== next.prioridade ||
      existing.medidas_prevencao !== next.medidas_prevencao ||
      existing.responsavel !== next.responsavel ||
      (existing.prazo
        ? new Date(existing.prazo).toISOString().slice(0, 10)
        : null) !== next.prazo ||
      existing.status_acao !== next.status_acao ||
      existing.ordem !== next.ordem
    );
  }

  private async loadRiskItemsForSync(
    aprId: string,
    manager?: EntityManager,
  ): Promise<AprRiskItem[]> {
    return (manager ?? this.aprsRepository.manager)
      .getRepository(AprRiskItem)
      .find({
        where: { apr_id: aprId },
        relations: ['evidences'],
        order: { ordem: 'ASC', created_at: 'ASC' },
      });
  }

  private async assertRiskItemSyncAllowed(
    aprId: string,
    items?: AprRiskItemSnapshot[],
  ): Promise<void> {
    const desired = items ?? [];
    const existing = await this.loadRiskItemsForSync(aprId);

    for (const [index, row] of existing.entries()) {
      const hasEvidence =
        Array.isArray(row.evidences) && row.evidences.length > 0;
      if (!hasEvidence) {
        continue;
      }

      const target = desired[index];
      if (!target) {
        throw new BadRequestException(
          'Não é possível remover item de risco que já possui evidências anexadas. Gere uma nova versão da APR para preservar a trilha.',
        );
      }

      if (this.hasRiskItemChanged(row, target)) {
        throw new BadRequestException(
          'Não é possível alterar item de risco com evidências anexadas. Gere uma nova versão da APR para preservar a trilha.',
        );
      }
    }
  }

  private async syncRiskItems(
    manager: EntityManager,
    aprId: string,
    items?: AprRiskItemSnapshot[],
  ): Promise<void> {
    const desired = items ?? [];
    const riskItemsRepository = manager.getRepository(AprRiskItem);
    const existing = await this.loadRiskItemsForSync(aprId, manager);

    const upserts: AprRiskItem[] = [];
    desired.forEach((item, index) => {
      const current = existing[index];
      if (current) {
        Object.assign(current, item);
        current.prazo = item.prazo ? new Date(item.prazo) : null;
        upserts.push(current);
        return;
      }

      upserts.push(
        riskItemsRepository.create({
          apr_id: aprId,
          ...item,
          prazo: item.prazo ? new Date(item.prazo) : null,
        }),
      );
    });

    const extras = existing.slice(desired.length);
    const removableExtras = extras.filter(
      (row) => !Array.isArray(row.evidences) || row.evidences.length === 0,
    );

    if (upserts.length > 0) {
      await riskItemsRepository.save(upserts);
    }

    if (removableExtras.length > 0) {
      await riskItemsRepository.delete(removableExtras.map((row) => row.id));
    }
  }

  private async materializeMissingRiskItems(apr: Apr): Promise<Apr> {
    if (!Array.isArray(apr.itens_risco) || apr.itens_risco.length === 0) {
      apr.risk_items = Array.isArray(apr.risk_items)
        ? apr.risk_items.slice().sort((left, right) => left.ordem - right.ordem)
        : [];
      apr.itens_risco = this.toLegacyRiskItemPayload(
        apr.risk_items.map((item) => this.mapPersistedRiskItemToSnapshot(item)),
      );
      return apr;
    }

    if (!Array.isArray(apr.risk_items) || apr.risk_items.length === 0) {
      await this.syncRiskItems(
        this.aprsRepository.manager,
        apr.id,
        this.buildAprRiskItemSnapshots({ itens_risco: apr.itens_risco }),
      );
      apr.risk_items = await this.aprsRepository.manager
        .getRepository(AprRiskItem)
        .find({
          where: { apr_id: apr.id },
          order: { ordem: 'ASC', created_at: 'ASC' },
        });
      apr.itens_risco = this.toLegacyRiskItemPayload(
        apr.risk_items.map((item) => this.mapPersistedRiskItemToSnapshot(item)),
      );
      return apr;
    }

    apr.risk_items = apr.risk_items
      .slice()
      .sort((left, right) => left.ordem - right.ordem);
    apr.itens_risco = this.toLegacyRiskItemPayload(
      apr.risk_items.map((item) => this.mapPersistedRiskItemToSnapshot(item)),
    );
    return apr;
  }

  private async assertCompanyScopedEntityId<
    T extends { id: string; company_id: string },
  >(
    manager: EntityManager,
    entity: { new (): T },
    companyId: string,
    id: string | null | undefined,
    label: string,
  ): Promise<void> {
    if (!id) {
      return;
    }

    const exists = await manager.getRepository(entity).exist({
      where: { id, company_id: companyId } as never,
    });

    if (!exists) {
      throw new BadRequestException(
        `${label} inválido para a empresa/tenant atual.`,
      );
    }
  }

  private async assertCompanyScopedEntityIds<
    T extends { id: string; company_id: string },
  >(
    manager: EntityManager,
    entity: { new (): T },
    companyId: string,
    ids: string[] | undefined,
    label: string,
  ): Promise<void> {
    const uniqueIds = Array.from(new Set((ids || []).filter(Boolean)));
    if (uniqueIds.length === 0) {
      return;
    }

    const count = await manager.getRepository(entity).count({
      where: { id: In(uniqueIds), company_id: companyId } as never,
    });

    if (count !== uniqueIds.length) {
      throw new BadRequestException(
        `${label} contém vínculo(s) inválido(s) para a empresa/tenant atual.`,
      );
    }
  }

  private async validateRelatedEntityScope(input: {
    manager?: EntityManager;
    companyId: string;
    siteId?: string | null;
    elaboradorId?: string | null;
    auditadoPorId?: string | null;
    activities?: string[];
    risks?: string[];
    epis?: string[];
    tools?: string[];
    machines?: string[];
    participants?: string[];
  }): Promise<void> {
    const manager = input.manager ?? this.aprsRepository.manager;
    await Promise.all([
      this.assertCompanyScopedEntityId(
        manager,
        Site,
        input.companyId,
        input.siteId,
        'Site',
      ),
      this.assertCompanyScopedEntityId(
        manager,
        User,
        input.companyId,
        input.elaboradorId,
        'Elaborador',
      ),
      this.assertCompanyScopedEntityId(
        manager,
        User,
        input.companyId,
        input.auditadoPorId,
        'Auditado por',
      ),
      this.assertCompanyScopedEntityIds(
        manager,
        Activity,
        input.companyId,
        input.activities,
        'Atividades',
      ),
      this.assertCompanyScopedEntityIds(
        manager,
        Risk,
        input.companyId,
        input.risks,
        'Riscos',
      ),
      this.assertCompanyScopedEntityIds(
        manager,
        Epi,
        input.companyId,
        input.epis,
        'EPIs',
      ),
      this.assertCompanyScopedEntityIds(
        manager,
        Tool,
        input.companyId,
        input.tools,
        'Ferramentas',
      ),
      this.assertCompanyScopedEntityIds(
        manager,
        Machine,
        input.companyId,
        input.machines,
        'Máquinas',
      ),
      this.assertCompanyScopedEntityIds(
        manager,
        User,
        input.companyId,
        input.participants,
        'Participantes',
      ),
    ]);
  }

  private buildAprTraceMetadata(apr: Apr): Record<string, unknown> {
    return {
      companyId: apr.company_id,
      status: apr.status,
      versao: apr.versao ?? 1,
      siteId: apr.site_id,
      participantCount: Array.isArray(apr.participants)
        ? apr.participants.length
        : 0,
      riskItemCount: Array.isArray(apr.risk_items)
        ? apr.risk_items.length
        : Array.isArray(apr.itens_risco)
          ? apr.itens_risco.length
          : 0,
    };
  }

  // ─── CRUD ────────────────────────────────────────────────────────────────────

  async create(createAprDto: CreateAprDto, userId?: string): Promise<Apr> {
    const {
      activities,
      risks,
      epis,
      tools,
      machines,
      participants,
      risk_items,
      itens_risco,
      ...rest
    } = createAprDto;
    const companyId = this.tenantService.getTenantId();
    if (!companyId) {
      throw new BadRequestException(
        'Tenant/empresa não identificado para criação da APR.',
      );
    }
    const normalizedRiskItems = this.buildAprRiskItemSnapshots({
      itens_risco: itens_risco as Array<Record<string, unknown>> | undefined,
      risk_items,
    });

    const savedId = await this.aprsRepository.manager.transaction(
      async (manager) => {
        await this.validateRelatedEntityScope({
          manager,
          companyId,
          siteId: createAprDto.site_id,
          elaboradorId: createAprDto.elaborador_id,
          auditadoPorId: createAprDto.auditado_por_id ?? null,
          activities,
          risks,
          epis,
          tools,
          machines,
          participants,
        });
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

        const aprRepository = manager.getRepository(Apr);
        const apr = aprRepository.create({
          ...rest,
          itens_risco: this.toLegacyRiskItemPayload(normalizedRiskItems),
          initial_risk: initialRisk,
          residual_risk: residualRisk,
          control_evidence: Boolean(rest.control_evidence),
          classificacao_resumo:
            this.buildAprClassificationSummary(normalizedRiskItems),
          company_id: companyId,
          activities: activities?.map((id) => ({ id }) as unknown as Activity),
          risks: risks?.map((id) => ({ id }) as unknown as Risk),
          epis: epis?.map((id) => ({ id }) as unknown as Epi),
          tools: tools?.map((id) => ({ id }) as unknown as Tool),
          machines: machines?.map((id) => ({ id }) as unknown as Machine),
          participants: participants?.map((id) => ({ id }) as unknown as User),
        });

        const saved = await aprRepository.save(apr);
        await this.syncRiskItems(manager, saved.id, normalizedRiskItems);
        if (saved.is_modelo_padrao) {
          await aprRepository.update(
            { company_id: saved.company_id },
            { is_modelo_padrao: false },
          );
          await aprRepository.update(
            { id: saved.id },
            { is_modelo_padrao: true, is_modelo: true },
          );
        }

        return saved.id;
      },
    );

    const saved = await this.findOne(savedId);
    this.logger.log({
      event: 'apr_created',
      aprId: saved.id,
      companyId: saved.company_id,
    });
    await this.addLog(
      saved.id,
      userId ?? saved.elaborador_id,
      APR_LOG_ACTIONS.CREATED,
      this.buildAprTraceMetadata(saved),
    );
    return this.findOne(saved.id);
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
        'aprovado_por',
        'risk_items',
      ],
    });
    if (!apr) {
      throw new NotFoundException(`APR com ID ${id} não encontrada`);
    }
    return this.materializeMissingRiskItems(apr);
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

  async update(
    id: string,
    updateAprDto: UpdateAprDto,
    userId?: string,
  ): Promise<Apr> {
    if ('status' in updateAprDto && updateAprDto.status !== undefined) {
      throw new BadRequestException(
        'Use os endpoints /approve, /reject ou /finalize para alterar o status da APR.',
      );
    }
    const apr = await this.findOneForWrite(id);
    this.assertAprFormMutable(apr);
    const {
      activities,
      risks,
      epis,
      tools,
      machines,
      participants,
      risk_items,
      itens_risco,
      ...rest
    } = updateAprDto;
    const persistedRiskItems = await this.loadRiskItemsForSync(id);

    const next = { ...rest };
    if (next.is_modelo_padrao) next.is_modelo = true;
    if (next.is_modelo === false) next.is_modelo_padrao = false;
    const nextRiskItems = this.buildAprRiskItemSnapshots({
      itens_risco:
        itens_risco !== undefined
          ? (itens_risco as Array<Record<string, unknown>>)
          : risk_items === undefined && persistedRiskItems.length > 0
            ? this.toLegacyRiskItemPayload(
                persistedRiskItems.map((item) =>
                  this.mapPersistedRiskItemToSnapshot(item),
                ),
              )
            : (apr.itens_risco as Array<Record<string, unknown>> | undefined),
      risk_items: risk_items !== undefined ? risk_items : undefined,
    });
    await this.assertRiskItemSyncAllowed(id, nextRiskItems);

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

    await this.aprsRepository.manager.transaction(async (manager) => {
      await this.validateRelatedEntityScope({
        manager,
        companyId: apr.company_id,
        siteId: next.site_id ?? apr.site_id,
        elaboradorId: next.elaborador_id ?? apr.elaborador_id,
        auditadoPorId:
          next.auditado_por_id !== undefined
            ? next.auditado_por_id
            : apr.auditado_por_id,
        activities,
        risks,
        epis,
        tools,
        machines,
        participants,
      });

      Object.assign(apr, {
        ...next,
        itens_risco: this.toLegacyRiskItemPayload(nextRiskItems),
        initial_risk: initialRisk,
        residual_risk: residualRisk,
        classificacao_resumo: this.buildAprClassificationSummary(nextRiskItems),
        control_evidence:
          next.control_evidence !== undefined
            ? Boolean(next.control_evidence)
            : Boolean(apr.control_evidence),
      });

      if (activities) {
        apr.activities = activities.map((itemId) => ({
          id: itemId,
        })) as unknown as Activity[];
      }
      if (risks) {
        apr.risks = risks.map((itemId) => ({
          id: itemId,
        })) as unknown as Risk[];
      }
      if (epis) {
        apr.epis = epis.map((itemId) => ({ id: itemId })) as unknown as Epi[];
      }
      if (tools) {
        apr.tools = tools.map((itemId) => ({
          id: itemId,
        })) as unknown as Tool[];
      }
      if (machines) {
        apr.machines = machines.map((itemId) => ({
          id: itemId,
        })) as unknown as Machine[];
      }
      if (participants) {
        apr.participants = participants.map((itemId) => ({
          id: itemId,
        })) as unknown as User[];
      }

      const aprRepository = manager.getRepository(Apr);
      const saved = await aprRepository.save(apr);
      await this.syncRiskItems(manager, saved.id, nextRiskItems);
      if (saved.is_modelo_padrao) {
        await aprRepository.update(
          { company_id: saved.company_id },
          { is_modelo_padrao: false },
        );
        await aprRepository.update(
          { id: saved.id },
          { is_modelo_padrao: true, is_modelo: true },
        );
      }
    });

    const saved = await this.findOne(id);
    this.logger.log({
      event: 'apr_updated',
      aprId: saved.id,
      companyId: saved.company_id,
    });
    await this.addLog(
      saved.id,
      userId ?? saved.elaborador_id,
      APR_LOG_ACTIONS.UPDATED,
      this.buildAprTraceMetadata(saved),
    );
    return this.findOne(saved.id);
  }

  async remove(id: string, userId?: string): Promise<void> {
    const apr = await this.findOneForWrite(id);
    this.assertAprRemovable(apr);
    await this.documentGovernanceService.removeFinalDocumentReference({
      companyId: apr.company_id,
      module: 'apr',
      entityId: apr.id,
      trailEventType: FORENSIC_EVENT_TYPES.FINAL_DOCUMENT_REMOVED,
      trailMetadata: {
        removalMode: 'soft_delete',
      },
      removeEntityState: async (manager) => {
        await manager.getRepository(Apr).softDelete(id);
      },
      cleanupStoredFile: (fileKey) =>
        this.documentStorageService.deleteFile(fileKey),
    });
    await this.addLog(id, userId, APR_LOG_ACTIONS.REMOVED, {
      companyId: apr.company_id,
    });
    this.logger.log({
      event: 'apr_soft_deleted',
      aprId: apr.id,
      companyId: apr.company_id,
    });
  }

  // ─── Workflow ────────────────────────────────────────────────────────────────

  async approve(id: string, userId: string, reason?: string): Promise<Apr> {
    const apr = await this.findOneForWrite(id);
    this.assertAprWorkflowTransitionAllowed(apr);
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
    await this.addLog(id, userId, APR_LOG_ACTIONS.APPROVED, {
      ...this.buildAprTraceMetadata(saved),
      motivo: reason,
    });
    this.logger.log({ event: 'apr_approved', aprId: id, userId });
    return saved;
  }

  async reject(id: string, userId: string, reason: string): Promise<Apr> {
    const apr = await this.findOneForWrite(id);
    this.assertAprWorkflowTransitionAllowed(apr);
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
    const previousStatus = currentStatus;
    const saved = await this.aprsRepository.manager.transaction(
      async (manager) => {
        const transactionalRepository = manager.getRepository(Apr);
        const persisted = await transactionalRepository.save(apr);
        await this.forensicTrailService.append(
          {
            eventType: FORENSIC_EVENT_TYPES.DOCUMENT_CANCELED,
            module: 'apr',
            entityId: persisted.id,
            companyId: persisted.company_id,
            userId,
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
    await this.addLog(id, userId, APR_LOG_ACTIONS.REJECTED, {
      ...this.buildAprTraceMetadata(saved),
      motivo: reason,
    });
    this.logger.log({ event: 'apr_rejected', aprId: id, userId });
    return saved;
  }

  async finalize(id: string, userId: string): Promise<Apr> {
    const apr = await this.findOneForWrite(id);
    this.assertAprWorkflowTransitionAllowed(apr);
    const currentStatus = this.ensureAprStatus(apr.status);
    const allowed = APR_ALLOWED_TRANSITIONS[currentStatus];
    if (!allowed?.includes(AprStatus.ENCERRADA)) {
      throw new BadRequestException(
        `Transição inválida: ${currentStatus} → Encerrada. Permitidas: ${allowed?.join(', ') || 'nenhuma'}`,
      );
    }
    apr.status = AprStatus.ENCERRADA;
    const saved = await this.aprsRepository.save(apr);
    await this.addLog(
      id,
      userId,
      APR_LOG_ACTIONS.FINALIZED,
      this.buildAprTraceMetadata(saved),
    );
    this.logger.log({ event: 'apr_finalized', aprId: id, userId });
    return saved;
  }

  async createNewVersion(id: string, userId: string): Promise<Apr> {
    const original = await this.findOne(id);
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
    const normalizedRiskItems = this.buildAprRiskItemSnapshots({
      itens_risco: original.itens_risco as Array<Record<string, unknown>>,
    });

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
      itens_risco: this.toLegacyRiskItemPayload(normalizedRiskItems),
      classificacao_resumo:
        this.buildAprClassificationSummary(normalizedRiskItems),
      company_id: original.company_id,
      site_id: original.site_id,
      elaborador_id: userId,
      versao: nextVersion,
      parent_apr_id: rootId,
      numero: `${original.numero}-v${nextVersion}`,
      activities: (original.activities || []).map((item) => ({ id: item.id })),
      risks: (original.risks || []).map((item) => ({ id: item.id })),
      epis: (original.epis || []).map((item) => ({ id: item.id })),
      tools: (original.tools || []).map((item) => ({ id: item.id })),
      machines: (original.machines || []).map((item) => ({ id: item.id })),
      participants: (original.participants || []).map((item) => ({
        id: item.id,
      })),
    });

    const saved = await this.aprsRepository.save(novo);
    await this.syncRiskItems(
      this.aprsRepository.manager,
      saved.id,
      normalizedRiskItems,
    );
    await this.addLog(id, userId, APR_LOG_ACTIONS.NEW_VERSION_GENERATED, {
      novaAprId: saved.id,
      versao: nextVersion,
      sourceAprId: id,
    });
    await this.addLog(saved.id, userId, APR_LOG_ACTIONS.CREATED_FROM_VERSION, {
      ...this.buildAprTraceMetadata(saved),
      sourceAprId: id,
      versao: nextVersion,
    });
    this.logger.log({
      event: 'apr_new_version',
      originalId: id,
      newId: saved.id,
      versao: nextVersion,
    });
    return this.findOne(saved.id);
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
    await this.documentStorageService.uploadFile(
      key,
      file.buffer,
      file.mimetype,
    );
    const uploadedToStorage = true;

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
    await this.addLog(id, userId, APR_LOG_ACTIONS.PDF_ATTACHED, {
      fileKey: key,
    });

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
    this.assertAprFormMutable(apr);

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
      await this.addLog(apr.id, userId, APR_LOG_ACTIONS.EVIDENCE_ATTACHED, {
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
    hasFinalPdf: boolean;
    availability: AprPdfAccessAvailability;
    message?: string;
    fileKey: string | null;
    folderPath: string | null;
    originalName: string | null;
    url: string | null;
  }> {
    const apr = await this.findOneForWrite(id);
    if (!apr.pdf_file_key) {
      return {
        entityId: apr.id,
        hasFinalPdf: false,
        availability: 'not_emitted',
        message: 'A APR ainda não possui PDF final emitido.',
        fileKey: null,
        folderPath: apr.pdf_folder_path ?? null,
        originalName: apr.pdf_original_name ?? null,
        url: null,
      };
    }

    let url: string | null = null;
    let availability: AprPdfAccessAvailability = 'ready';
    let message: string | undefined;
    try {
      url = await this.documentStorageService.getSignedUrl(
        apr.pdf_file_key,
        3600,
      );
    } catch {
      url = null;
      availability = 'registered_without_signed_url';
      message =
        'O PDF final está registrado, mas a URL segura não está disponível no momento.';
    }

    return {
      entityId: apr.id,
      hasFinalPdf: true,
      availability,
      message,
      fileKey: apr.pdf_file_key,
      folderPath: apr.pdf_folder_path ?? null,
      originalName: apr.pdf_original_name ?? null,
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

  previewExcelImport(
    buffer: Buffer,
    fileName: string,
  ): AprExcelImportPreviewDto {
    return this.aprExcelService.previewImport(buffer, fileName);
  }

  exportExcelTemplate(): Buffer {
    return this.aprExcelService.buildTemplateWorkbook();
  }

  async exportAprExcel(
    id: string,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const apr = await this.findOne(id);
    return {
      buffer: this.aprExcelService.buildDetailWorkbook(apr),
      fileName: `apr-${String(apr.numero || apr.id).replace(/[^a-zA-Z0-9_-]/g, '_')}.xlsx`,
    };
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
