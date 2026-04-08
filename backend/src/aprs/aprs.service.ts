import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, FindOptionsWhere, In, Repository } from 'typeorm';
import { jsonToExcelBuffer } from '../common/utils/excel.util';
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
import { PdfService } from '../common/services/pdf.service';
import { MetricsService } from '../common/observability/metrics.service';
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
import { AprsPdfService } from './services/aprs-pdf.service';
import { AprsEvidenceService } from './services/aprs-evidence.service';

const APR_LOG_ACTIONS = {
  CREATED: 'APR_CRIADA',
  UPDATED: 'APR_ATUALIZADA',
  APPROVED: 'APR_APROVADA',
  REJECTED: 'APR_REPROVADA',
  FINALIZED: 'APR_ENCERRADA',
  PDF_ATTACHED: 'APR_PDF_ANEXADO',
  PDF_GENERATED: 'APR_PDF_GERADO',
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

type AprAiContextSummary = {
  id: string;
  codigo: string;
  status: string;
  created_at: Date;
  company_id: string;
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
    private readonly pdfService: PdfService,
    private readonly documentGovernanceService: DocumentGovernanceService,
    private readonly signaturesService: SignaturesService,
    private readonly forensicTrailService: ForensicTrailService,
    private readonly aprsPdfService: AprsPdfService,
    private readonly aprsEvidenceService: AprsEvidenceService,
    @Optional() private readonly metricsService?: MetricsService,
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

  private buildAprFinalPdfOriginalName(
    apr: Pick<Apr, 'numero' | 'versao' | 'id'>,
  ): string {
    const reference = String(apr.numero || apr.id || 'apr')
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const version = Number(apr.versao ?? 1);

    return `${reference || 'apr'}_v${version}.pdf`;
  }

  private stringifyAprHtmlValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return String(value);
    }

    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }

  private escapeHtml(value: unknown): string {
    return this.stringifyAprHtmlValue(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private formatAprDisplayDate(
    value?: Date | string | null,
    fallback = '-',
  ): string {
    if (!value) {
      return fallback;
    }

    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return fallback;
    }

    return parsed.toLocaleDateString('pt-BR', {
      timeZone: 'UTC',
    });
  }

  private formatAprDisplayDateTime(
    value?: Date | string | null,
    fallback = '-',
  ): string {
    if (!value) {
      return fallback;
    }

    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return fallback;
    }

    return parsed.toLocaleString('pt-BR', {
      timeZone: 'UTC',
    });
  }

  private isEmptyRiskItemSnapshot(item: AprRiskItemSnapshot): boolean {
    return ![
      item.atividade,
      item.agente_ambiental,
      item.condicao_perigosa,
      item.fonte_circunstancia,
      item.lesao,
      item.probabilidade,
      item.severidade,
      item.medidas_prevencao,
      item.responsavel,
      item.prazo,
      item.status_acao,
    ].some((value) => {
      if (typeof value === 'number') {
        return Number.isFinite(value) && value > 0;
      }

      return Boolean(value);
    });
  }

  private getRiskItemApprovalIssues(item: AprRiskItemSnapshot): string[] {
    const issues: string[] = [];

    if (!item.atividade) {
      issues.push('atividade/processo');
    }
    if (!item.condicao_perigosa) {
      issues.push('condição perigosa');
    }
    if (!item.probabilidade) {
      issues.push('probabilidade');
    }
    if (!item.severidade) {
      issues.push('severidade');
    }
    if (!item.medidas_prevencao) {
      issues.push('medidas de prevenção');
    }

    return issues;
  }

  private assertAprDateRange(
    start?: Date | string | null,
    end?: Date | string | null,
  ): void {
    if (!start || !end) {
      return;
    }

    const startDate = start instanceof Date ? start : new Date(start);
    const endDate = end instanceof Date ? end : new Date(end);

    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime()) ||
      endDate < startDate
    ) {
      throw new BadRequestException(
        'A validade/data fim da APR não pode ser anterior à data de início.',
      );
    }
  }

  private assertAprDraftIntegrity(input: {
    status?: string | null;
    dataInicio?: Date | string | null;
    dataFim?: Date | string | null;
    participants?: string[] | User[];
    riskItems: AprRiskItemSnapshot[];
  }): void {
    if (
      input.status &&
      this.ensureAprStatus(input.status) !== AprStatus.PENDENTE
    ) {
      throw new BadRequestException(
        'Novas APRs ou edições de formulário devem permanecer pendentes. Use os fluxos formais de aprovação, cancelamento ou encerramento para mudar o estado.',
      );
    }

    this.assertAprDateRange(input.dataInicio, input.dataFim);

    const participantIds = (
      Array.isArray(input.participants) ? input.participants : []
    )
      .map((participant): string | null => {
        if (typeof participant === 'string') {
          return participant;
        }

        if (
          participant &&
          typeof participant === 'object' &&
          'id' in participant
        ) {
          const participantRecord = participant as { id?: unknown };
          return typeof participantRecord.id === 'string'
            ? participantRecord.id
            : null;
        }

        return null;
      })
      .filter((participantId): participantId is string =>
        Boolean(participantId),
      );
    if (
      participantIds.length > 0 &&
      new Set(participantIds).size !== participantIds.length
    ) {
      throw new BadRequestException(
        'A lista de participantes da APR contém registros duplicados.',
      );
    }
  }

  private assertAprReadyForApproval(
    apr: Pick<
      Apr,
      | 'id'
      | 'status'
      | 'pdf_file_key'
      | 'participants'
      | 'risk_items'
      | 'itens_risco'
      | 'data_inicio'
      | 'data_fim'
    >,
  ): void {
    this.assertAprWorkflowTransitionAllowed(apr);
    this.assertAprDateRange(apr.data_inicio, apr.data_fim);

    if (this.ensureAprStatus(apr.status) !== AprStatus.PENDENTE) {
      throw new BadRequestException(
        'Somente APRs pendentes podem seguir para aprovação.',
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
        'A APR precisa ter participantes definidos antes da aprovação.',
      );
    }

    const normalizedRiskItems = Array.isArray(apr.risk_items)
      ? apr.risk_items.map((item) => this.mapPersistedRiskItemToSnapshot(item))
      : this.buildAprRiskItemSnapshots({
          itens_risco: apr.itens_risco as
            | Array<Record<string, unknown>>
            | undefined,
        });

    if (normalizedRiskItems.length === 0) {
      throw new BadRequestException(
        'A APR precisa ter ao menos um item de risco válido antes da aprovação.',
      );
    }

    const incompleteItem = normalizedRiskItems.find(
      (item) => this.getRiskItemApprovalIssues(item).length > 0,
    );

    if (incompleteItem) {
      throw new BadRequestException(
        `A APR não pode ser aprovada com itens de risco incompletos. Revise a linha ${incompleteItem.ordem + 1} e preencha: ${this.getRiskItemApprovalIssues(incompleteItem).join(', ')}.`,
      );
    }
  }

  private assertAprReadyForFinalization(
    apr: Pick<Apr, 'status' | 'pdf_file_key'>,
  ): void {
    // Mantém a regra de "PDF lock": quando o PDF final existe, nenhuma transição de status
    // deve ocorrer no documento. Isso evita inconsistência operacional e bypass de workflow.
    this.assertAprWorkflowTransitionAllowed(apr);

    if (this.ensureAprStatus(apr.status) !== AprStatus.APROVADA) {
      throw new BadRequestException(
        'Somente APRs aprovadas podem ser encerradas.',
      );
    }
  }

  private renderAprFinalPdfHtml(input: {
    apr: Apr;
    documentCode: string;
    signatures: Array<{
      user_id?: string;
      type?: string;
      signed_at?: Date | string;
      user?: { nome?: string } | null;
    }>;
    evidences: AprRiskEvidence[];
  }): string {
    const { apr, documentCode, signatures, evidences } = input;
    const riskItems = (apr.risk_items || [])
      .slice()
      .sort((left, right) => left.ordem - right.ordem);
    const signatureRows = signatures
      .map(
        (signature) => `
          <tr>
            <td>${this.escapeHtml(signature.user?.nome || signature.user_id || 'Usuário')}</td>
            <td>${this.escapeHtml(signature.type || 'digital')}</td>
            <td>${this.escapeHtml(this.formatAprDisplayDateTime(signature.signed_at, '-'))}</td>
          </tr>
        `,
      )
      .join('');

    const participantList = Array.isArray(apr.participants)
      ? apr.participants
          .map((participant) => participant.nome)
          .filter((name): name is string => Boolean(name))
      : [];

    const evidenceCountByRiskItem = new Map<string, number>();
    evidences.forEach((evidence) => {
      evidenceCountByRiskItem.set(
        evidence.apr_risk_item_id,
        (evidenceCountByRiskItem.get(evidence.apr_risk_item_id) || 0) + 1,
      );
    });

    const summary = apr.classificacao_resumo || {
      total: riskItems.length,
      aceitavel: 0,
      atencao: 0,
      substancial: 0,
      critico: 0,
    };

    const riskRows = riskItems
      .map(
        (item) => `
          <tr>
            <td>${item.ordem + 1}</td>
            <td>${this.escapeHtml(item.atividade || '-')}</td>
            <td>${this.escapeHtml(item.agente_ambiental || '-')}</td>
            <td>${this.escapeHtml(item.condicao_perigosa || '-')}</td>
            <td>${this.escapeHtml(item.fonte_circunstancia || '-')}</td>
            <td>${this.escapeHtml(item.lesao || '-')}</td>
            <td>${this.escapeHtml(item.probabilidade ?? '-')}</td>
            <td>${this.escapeHtml(item.severidade ?? '-')}</td>
            <td>${this.escapeHtml(item.score_risco ?? '-')}</td>
            <td>${this.escapeHtml(item.categoria_risco || '-')}</td>
            <td>${this.escapeHtml(item.prioridade || '-')}</td>
            <td>${this.escapeHtml(item.medidas_prevencao || '-')}</td>
            <td>${this.escapeHtml(item.responsavel || '-')}</td>
            <td>${this.escapeHtml(this.formatAprDisplayDate(item.prazo, '-'))}</td>
            <td>${this.escapeHtml(item.status_acao || '-')}</td>
            <td>${this.escapeHtml(evidenceCountByRiskItem.get(item.id) || 0)}</td>
          </tr>
        `,
      )
      .join('');

    return `
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>${this.escapeHtml(apr.titulo || apr.numero || 'APR')}</title>
          <style>
            @page {
              size: A4;
              margin: 16mm 12mm 18mm 12mm;
            }
            :root {
              color-scheme: light;
            }
            * {
              box-sizing: border-box;
            }
            body {
              font-family: Arial, Helvetica, sans-serif;
              color: #0f172a;
              font-size: 11px;
              line-height: 1.45;
              margin: 0;
            }
            h1, h2, h3, p {
              margin: 0;
            }
            .page {
              width: 100%;
            }
            .hero {
              border: 1px solid #cbd5e1;
              border-radius: 14px;
              padding: 16px 18px;
              background: linear-gradient(135deg, #eff6ff 0%, #ffffff 55%);
              margin-bottom: 16px;
            }
            .eyebrow {
              color: #2563eb;
              font-size: 9px;
              font-weight: 700;
              letter-spacing: 0.18em;
              text-transform: uppercase;
            }
            .hero-grid {
              display: grid;
              grid-template-columns: 1.6fr 0.9fr;
              gap: 14px;
              margin-top: 8px;
            }
            .hero-title {
              font-size: 24px;
              font-weight: 800;
              margin-top: 8px;
            }
            .hero-subtitle {
              margin-top: 6px;
              color: #475569;
              font-size: 12px;
            }
            .meta-panel {
              border: 1px solid #dbeafe;
              border-radius: 12px;
              padding: 12px;
              background: rgba(255,255,255,0.84);
            }
            .meta-grid {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 10px;
            }
            .meta-label {
              font-size: 9px;
              color: #64748b;
              font-weight: 700;
              letter-spacing: 0.12em;
              text-transform: uppercase;
            }
            .meta-value {
              margin-top: 4px;
              font-size: 12px;
              font-weight: 700;
            }
            .section {
              margin-top: 14px;
              border: 1px solid #e2e8f0;
              border-radius: 12px;
              padding: 12px 14px;
              page-break-inside: avoid;
            }
            .section-title {
              font-size: 13px;
              font-weight: 800;
              margin-bottom: 10px;
              color: #0f172a;
            }
            .details-grid {
              display: grid;
              grid-template-columns: repeat(3, minmax(0, 1fr));
              gap: 10px;
            }
            .summary-grid {
              display: grid;
              grid-template-columns: repeat(5, minmax(0, 1fr));
              gap: 8px;
            }
            .summary-card {
              border: 1px solid #e2e8f0;
              border-radius: 10px;
              padding: 10px;
              background: #f8fafc;
            }
            .summary-card strong {
              display: block;
              font-size: 18px;
              margin-top: 4px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
            }
            thead {
              display: table-header-group;
            }
            th {
              background: #eff6ff;
              color: #0f172a;
              font-size: 9px;
              text-transform: uppercase;
              letter-spacing: 0.08em;
            }
            th, td {
              border: 1px solid #dbe3ee;
              padding: 6px 7px;
              text-align: left;
              vertical-align: top;
              word-break: break-word;
            }
            tbody tr:nth-child(even) {
              background: #f8fafc;
            }
            .participants {
              margin: 0;
              padding-left: 16px;
            }
            .footer {
              margin-top: 14px;
              color: #475569;
              font-size: 10px;
            }
          </style>
        </head>
        <body>
          <div class="page">
            <section class="hero">
              <div class="eyebrow">Documento técnico governado</div>
              <div class="hero-grid">
                <div>
                  <h1 class="hero-title">Análise Preliminar de Risco</h1>
                  <p class="hero-subtitle">
                    Relatório oficial emitido pelo backend, integrado à governança documental e ao inventário operacional do SST.
                  </p>
                </div>
                <div class="meta-panel">
                  <div class="meta-grid">
                    <div>
                      <div class="meta-label">Código documental</div>
                      <div class="meta-value">${this.escapeHtml(documentCode)}</div>
                    </div>
                    <div>
                      <div class="meta-label">Status</div>
                      <div class="meta-value">${this.escapeHtml(apr.status)}</div>
                    </div>
                    <div>
                      <div class="meta-label">Número APR</div>
                      <div class="meta-value">${this.escapeHtml(apr.numero || '-')}</div>
                    </div>
                    <div>
                      <div class="meta-label">Versão</div>
                      <div class="meta-value">${this.escapeHtml(apr.versao ?? 1)}</div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section class="section">
              <h2 class="section-title">Identificação e contexto operacional</h2>
              <div class="details-grid">
                <div>
                  <div class="meta-label">Empresa</div>
                  <div class="meta-value">${this.escapeHtml(apr.company?.razao_social || apr.company_id)}</div>
                </div>
                <div>
                  <div class="meta-label">CNPJ</div>
                  <div class="meta-value">${this.escapeHtml(apr.company?.cnpj || '-')}</div>
                </div>
                <div>
                  <div class="meta-label">Unidade / obra</div>
                  <div class="meta-value">${this.escapeHtml(apr.site?.nome || apr.site_id)}</div>
                </div>
                <div>
                  <div class="meta-label">Elaborador</div>
                  <div class="meta-value">${this.escapeHtml(apr.elaborador?.nome || apr.elaborador_id)}</div>
                </div>
                <div>
                  <div class="meta-label">Período</div>
                  <div class="meta-value">${this.escapeHtml(`${this.formatAprDisplayDate(apr.data_inicio)} até ${this.formatAprDisplayDate(apr.data_fim)}`)}</div>
                </div>
                <div>
                  <div class="meta-label">Participantes</div>
                  <div class="meta-value">${this.escapeHtml(String(participantList.length))}</div>
                </div>
              </div>
              <div style="margin-top: 12px;">
                <div class="meta-label">Título</div>
                <div class="meta-value">${this.escapeHtml(apr.titulo || '-')}</div>
              </div>
              <div style="margin-top: 12px;">
                <div class="meta-label">Descrição</div>
                <div>${this.escapeHtml(apr.descricao || 'Sem descrição operacional complementar.')}</div>
              </div>
              <div style="margin-top: 12px;">
                <div class="meta-label">Participantes vinculados</div>
                ${
                  participantList.length > 0
                    ? `<ul class="participants">${participantList
                        .map((name) => `<li>${this.escapeHtml(name)}</li>`)
                        .join('')}</ul>`
                    : '<div>-</div>'
                }
              </div>
            </section>

            <section class="section">
              <h2 class="section-title">Resumo executivo de risco</h2>
              <div class="summary-grid">
                <div class="summary-card"><span class="meta-label">Itens avaliados</span><strong>${summary.total}</strong></div>
                <div class="summary-card"><span class="meta-label">Aceitável</span><strong>${summary.aceitavel}</strong></div>
                <div class="summary-card"><span class="meta-label">Atenção</span><strong>${summary.atencao}</strong></div>
                <div class="summary-card"><span class="meta-label">Substancial</span><strong>${summary.substancial}</strong></div>
                <div class="summary-card"><span class="meta-label">Crítico</span><strong>${summary.critico}</strong></div>
              </div>
            </section>

            <section class="section">
              <h2 class="section-title">Matriz de risco e controles</h2>
              <table>
                <thead>
                  <tr>
                    <th>Linha</th>
                    <th>Atividade</th>
                    <th>Agente</th>
                    <th>Condição perigosa</th>
                    <th>Fonte / circunstância</th>
                    <th>Possíveis lesões</th>
                    <th>P</th>
                    <th>S</th>
                    <th>Score</th>
                    <th>Categoria</th>
                    <th>Prioridade</th>
                    <th>Medidas</th>
                    <th>Responsável</th>
                    <th>Prazo</th>
                    <th>Status</th>
                    <th>Evidências</th>
                  </tr>
                </thead>
                <tbody>
                  ${
                    riskRows ||
                    `
                    <tr>
                      <td colspan="16">Nenhum item de risco estruturado disponível.</td>
                    </tr>
                  `
                  }
                </tbody>
              </table>
            </section>

            <section class="section">
              <h2 class="section-title">Assinaturas e rastreabilidade</h2>
              <table>
                <thead>
                  <tr>
                    <th>Assinante</th>
                    <th>Tipo</th>
                    <th>Registrada em</th>
                  </tr>
                </thead>
                <tbody>
                  ${
                    signatureRows ||
                    `
                    <tr>
                      <td colspan="3">Nenhuma assinatura operacional registrada.</td>
                    </tr>
                  `
                  }
                </tbody>
              </table>
              <div class="footer">
                Documento emitido pela esteira oficial do backend. Referência: ${this.escapeHtml(documentCode)}.
                Última atualização operacional: ${this.escapeHtml(this.formatAprDisplayDateTime(apr.updated_at, '-'))}.
              </div>
            </section>
          </div>
        </body>
      </html>
    `;
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

    return source
      .map((item, index) => this.normalizeAprRiskItemInput(item, index))
      .filter((item) => !this.isEmptyRiskItemSnapshot(item))
      .map((item, index) => ({
        ...item,
        ordem: index,
      }));
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
      prazo: this.normalizeDateOnly(item.prazo),
      status_acao: item.status_acao,
      ordem: item.ordem,
    };
  }

  private normalizeDateOnly(value: unknown): string | null {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      return Number.isNaN(value.getTime())
        ? null
        : value.toISOString().slice(0, 10);
    }

    const normalized = String(value).trim();
    if (!normalized) {
      return null;
    }

    const directDate = normalized.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
    if (directDate) {
      return directDate;
    }

    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime())
      ? null
      : parsed.toISOString().slice(0, 10);
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
      this.normalizeDateOnly(existing.prazo) !== next.prazo ||
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
    this.assertAprDraftIntegrity({
      status: createAprDto.status,
      dataInicio: createAprDto.data_inicio,
      dataFim: createAprDto.data_fim,
      participants,
      riskItems: normalizedRiskItems,
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
          status: AprStatus.PENDENTE,
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
          // Operação atômica: desativa todos os modelos padrão da empresa
          // e ativa apenas este, dentro da mesma transação.
          // Isso elimina a race condition dos dois UPDATEs separados e
          // é compatível com o índice parcial único UQ_aprs_modelo_padrao_per_company.
          await manager.query(
            `UPDATE aprs
             SET is_modelo_padrao = CASE WHEN id = $1 THEN true ELSE false END,
                 is_modelo        = CASE WHEN id = $1 THEN true ELSE is_modelo END
             WHERE company_id = $2 AND deleted_at IS NULL AND (is_modelo_padrao = true OR id = $1)`,
            [saved.id, saved.company_id],
          );
        }

        return saved.id;
      },
    );

    // Único findOne pós-transação: carrega todas as relações para o retorno HTTP
    // e reutiliza o mesmo objeto para logging/auditoria — elimina o double-fetch
    // que existia antes (2× findOne com 12 relações = ~200ms extras por criação).
    const result = await this.findOne(savedId);
    this.logger.log({
      event: 'apr_created',
      aprId: result.id,
      companyId: result.company_id,
    });
    this.metricsService?.incrementAprCreated(result.company_id, result.status);
    // Fire-and-forget: auditoria não bloqueia resposta ao cliente.
    // Falhas são logadas internamente; o APR já foi persistido com sucesso.
    void this.addLog(
      result.id,
      userId ?? result.elaborador_id,
      APR_LOG_ACTIONS.CREATED,
      this.buildAprTraceMetadata(result),
    ).catch((err: unknown) => {
      this.logger.error({
        event: 'apr_create_log_failed',
        aprId: result.id,
        error: err instanceof Error ? err.message : String(err),
      });
    });
    return result;
  }

  /**
   * Retorna APRs completas com todas as relações carregadas.
   *
   * **ATENÇÃO:** use apenas em contextos internos controlados onde o volume
   * de registros é conhecido e pequeno (ex.: geração de PDF, exportação
   * unitária). NUNCA chame este método em loops ou a partir de contextos de IA.
   */
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

  /**
   * Retorna um snapshot leve das APRs para uso em contexto de IA.
   *
   * Limitado a 300 registros mais recentes, sem relações e com apenas os
   * campos necessários para enriquecer prompts (`id`, `codigo`, `status`,
   * `created_at`, `company_id`). Use este método em vez de `findAll()`
   * sempre que o destino for um modelo de linguagem ou pipeline de IA.
   *
   * @param tenantId ID da empresa — obrigatório para garantir isolamento multi-tenant.
   */
  async findAllForAiContext(tenantId: string): Promise<AprAiContextSummary[]> {
    const rows = await this.aprsRepository.find({
      where: { company_id: tenantId },
      // `numero` é o código interno persistido; expomos como `codigo` no snapshot de IA.
      select: ['id', 'numero', 'status', 'created_at', 'company_id'],
      order: { created_at: 'DESC' },
      take: 300,
    });

    return rows.map((apr) => ({
      id: apr.id,
      codigo: apr.numero,
      status: apr.status,
      created_at: apr.created_at,
      company_id: apr.company_id,
    }));
  }

  async findPaginated(opts?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    siteId?: string;
    responsibleId?: string;
    dueFilter?: string;
    sort?: 'priority' | 'updated-desc' | 'deadline-asc' | 'title-asc';
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
      .leftJoin('apr.company', 'company')
      .leftJoin('apr.site', 'site')
      .leftJoin('apr.elaborador', 'elaborador')
      .leftJoin('apr.auditado_por', 'auditado_por')
      .leftJoin('apr.aprovado_por', 'aprovado_por')
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
        'apr.site_id',
        'apr.elaborador_id',
        'apr.auditado_por_id',
        'apr.aprovado_por_id',
        'apr.pdf_file_key',
        'apr.pdf_original_name',
        'apr.classificacao_resumo',
        'apr.created_at',
        'apr.updated_at',
        'company.id',
        'company.razao_social',
        'site.id',
        'site.nome',
        'elaborador.id',
        'elaborador.nome',
        'elaborador.funcao',
        'auditado_por.id',
        'auditado_por.nome',
        'auditado_por.funcao',
        'aprovado_por.id',
        'aprovado_por.nome',
        'aprovado_por.funcao',
      ])
      .skip(skip)
      .take(limit);

    if (tenantId) {
      qb.where('apr.company_id = :tenantId', { tenantId });
    } else if (opts?.companyId) {
      qb.where('apr.company_id = :companyId', { companyId: opts.companyId });
    }

    if (opts?.search) {
      qb.andWhere(
        `(apr.numero ILIKE :search
          OR apr.titulo ILIKE :search
          OR site.nome ILIKE :search
          OR elaborador.nome ILIKE :search
          OR auditado_por.nome ILIKE :search
          OR aprovado_por.nome ILIKE :search)`,
        { search: `%${opts.search}%` },
      );
    }

    if (opts?.status) {
      qb.andWhere('apr.status = :status', { status: opts.status });
    }

    if (opts?.siteId) {
      qb.andWhere('apr.site_id = :siteId', { siteId: opts.siteId });
    }

    if (opts?.responsibleId) {
      qb.andWhere(
        `CASE
          WHEN apr.status IN (:...approvedStates) AND apr.aprovado_por_id IS NOT NULL THEN apr.aprovado_por_id
          WHEN apr.auditado_por_id IS NOT NULL THEN apr.auditado_por_id
          ELSE apr.elaborador_id
        END = :responsibleId`,
        {
          approvedStates: [AprStatus.APROVADA, AprStatus.ENCERRADA],
          responsibleId: opts.responsibleId,
        },
      );
    }

    if (opts?.dueFilter) {
      switch (opts.dueFilter) {
        case 'today':
          qb.andWhere('apr.data_fim = CURRENT_DATE');
          break;
        case 'next-7-days':
          qb.andWhere(
            "apr.data_fim >= CURRENT_DATE AND apr.data_fim <= CURRENT_DATE + INTERVAL '7 days'",
          );
          break;
        case 'expired':
          qb.andWhere('apr.data_fim < CURRENT_DATE');
          break;
        case 'upcoming':
          qb.andWhere("apr.data_fim > CURRENT_DATE + INTERVAL '7 days'");
          break;
        case 'no-deadline':
          qb.andWhere('apr.data_fim IS NULL');
          break;
        default:
          break;
      }
    }

    if (opts?.isModeloPadrao !== undefined) {
      qb.andWhere('apr.is_modelo_padrao = :isModeloPadrao', {
        isModeloPadrao: opts.isModeloPadrao,
      });
    }

    const priorityOrderExpression = `CASE
      WHEN apr.status = '${AprStatus.PENDENTE}' AND apr.data_fim < CURRENT_DATE THEN 0
      WHEN apr.status = '${AprStatus.PENDENTE}' AND apr.data_fim = CURRENT_DATE THEN 1
      WHEN apr.status = '${AprStatus.PENDENTE}' AND apr.data_fim <= CURRENT_DATE + INTERVAL '7 days' THEN 2
      WHEN apr.status = '${AprStatus.APROVADA}' AND apr.pdf_file_key IS NULL THEN 3
      WHEN apr.status = '${AprStatus.PENDENTE}' THEN 4
      WHEN apr.status = '${AprStatus.APROVADA}' THEN 5
      WHEN apr.status = '${AprStatus.ENCERRADA}' THEN 6
      ELSE 7
    END`;

    switch (opts?.sort) {
      case 'updated-desc':
        qb.orderBy('apr.updated_at', 'DESC');
        break;
      case 'deadline-asc':
        qb.orderBy('apr.data_fim', 'ASC', 'NULLS LAST').addOrderBy(
          'apr.updated_at',
          'DESC',
        );
        break;
      case 'title-asc':
        qb.orderBy('apr.titulo', 'ASC').addOrderBy('apr.created_at', 'DESC');
        break;
      case 'priority':
      default:
        qb
          // TypeORM perde a referencia do alias quando o ORDER BY recebe a
          // expressao CASE crua em consultas paginadas com getManyAndCount().
          // Materializamos a prioridade como select nomeado e ordenamos pelo alias.
          .addSelect(priorityOrderExpression, 'apr_priority_order')
          .orderBy('apr_priority_order', 'ASC')
          .addOrderBy('apr.data_fim', 'ASC', 'NULLS LAST')
          .addOrderBy('apr.updated_at', 'DESC');
        break;
    }

    const [rows, total] = await qb.getManyAndCount();
    const data = rows.map((row) => plainToClass(AprListItemDto, row));
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

  /**
   * Carrega somente o necessário para a decisão de aprovação.
   * Mantém o write path explícito e evita depender do findOne() genérico
   * com eager-load amplo de relações não usadas no fluxo crítico.
   */
  private async findOneForApproval(id: string): Promise<Apr> {
    const tenantId = this.tenantService.getTenantId();
    const apr = await this.aprsRepository.findOne({
      where: tenantId ? { id, company_id: tenantId } : { id },
      relations: ['participants', 'risk_items'],
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

    // Detecção de conflito otimista: rejeita se o cliente enviou um timestamp
    // desatualizado, indicando que outro usuário salvou a APR enquanto este estava offline.
    if (updateAprDto._conflict_guard_updated_at) {
      const guardTs = new Date(updateAprDto._conflict_guard_updated_at).getTime();
      const currentTs = new Date(apr.updated_at).getTime();
      if (!Number.isNaN(guardTs) && Math.abs(currentTs - guardTs) > 1000) {
        throw new ConflictException(
          'A APR foi modificada por outro usuário enquanto você estava offline. Recarregue e aplique suas alterações novamente.',
        );
      }
    }
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
    this.assertAprDraftIntegrity({
      status: apr.status,
      dataInicio: next.data_inicio ?? apr.data_inicio,
      dataFim: next.data_fim ?? apr.data_fim,
      participants:
        participants ??
        (Array.isArray(apr.participants)
          ? apr.participants.map((participant) => participant.id)
          : []),
      riskItems: nextRiskItems,
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

      // Aviso antecipado: detecta itens com campos obrigatórios ausentes para
      // que o usuário corrija antes de tentar aprovar (o bloqueio real ocorre na aprovação).
      const incompleteItems = nextRiskItems.filter(
        (item) => this.getRiskItemApprovalIssues(item).length > 0,
      );
      if (incompleteItems.length > 0) {
        this.logger.warn({
          event: 'apr_update_incomplete_risk_items',
          aprId: saved.id,
          count: incompleteItems.length,
          message:
            'APR salva com itens de risco incompletos. A aprovação será bloqueada até que todos os campos obrigatórios sejam preenchidos.',
        });
      }

      if (saved.is_modelo_padrao) {
        await manager.query(
          `UPDATE aprs
           SET is_modelo_padrao = CASE WHEN id = $1 THEN true ELSE false END,
               is_modelo        = CASE WHEN id = $1 THEN true ELSE is_modelo END
           WHERE company_id = $2 AND deleted_at IS NULL AND (is_modelo_padrao = true OR id = $1)`,
          [saved.id, saved.company_id],
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

    // Limpar evidências órfãs: com a APR soft-deletada, os registros de
    // apr_risk_evidences ficam órfãos no storage. Removemos os arquivos S3 e
    // os registros do DB de forma assíncrona (fire-and-forget com log de erro).
    this.cleanupAprEvidences(id).catch((err) => {
      this.logger.error({
        event: 'apr_evidence_cleanup_failed',
        aprId: id,
        error: err instanceof Error ? err.message : String(err),
      });
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

  private async cleanupAprEvidences(aprId: string): Promise<void> {
    const evidenceRepository =
      this.aprsRepository.manager.getRepository(AprRiskEvidence);
    const evidences = await evidenceRepository.find({
      where: { apr_id: aprId },
      select: ['id', 'file_key', 'watermarked_file_key'],
    });

    if (evidences.length === 0) {
      return;
    }

    let deleted = 0;
    let failed = 0;

    for (const evidence of evidences) {
      const keys = [evidence.file_key, evidence.watermarked_file_key].filter(
        Boolean,
      ) as string[];
      for (const key of keys) {
        try {
          await this.documentStorageService.deleteFile(key);
        } catch (err) {
          failed += 1;
          this.logger.warn({
            event: 'apr_evidence_file_delete_failed',
            aprId,
            evidenceId: evidence.id,
            fileKey: key,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      deleted += 1;
    }

    await evidenceRepository.delete(evidences.map((e) => e.id));
    this.logger.log({
      event: 'apr_evidence_cleanup_done',
      aprId,
      total: evidences.length,
      deleted,
      storageFailures: failed,
    });
  }

  // ─── Workflow ────────────────────────────────────────────────────────────────

  /**
   * Executa uma transição de status da APR de forma atômica e segura.
   *
   * Problema resolvido: sem SELECT FOR UPDATE, dois requests simultâneos
   * (ex: dois aprovadores clicando ao mesmo tempo) passavam ambos na
   * validação de status e gravavam o novo status em paralelo — resultando
   * em estado corrompido ou log duplicado.
   *
   * Solução: toda a sequência lê + valida + atualiza dentro de uma única
   * transação com SELECT ... FOR UPDATE NO WAIT no registro da APR.
   * O banco garante exclusão mútua: o segundo request recebe 55P03
   * (lock_not_available) e retorna ConflictException ao usuário.
   */
  private async executeAprWorkflowTransition(
    id: string,
    fn: (apr: Apr, manager: EntityManager) => Promise<Apr>,
  ): Promise<Apr> {
    const tenantId = this.tenantService.getTenantId();

    return this.aprsRepository.manager.transaction(async (manager) => {
      // SELECT FOR UPDATE NO WAIT: falha imediatamente se outro request
      // já tiver o lock — evita espera e retorna erro claro ao cliente.
      const rows = await manager.query<Apr[]>(
        `SELECT * FROM "aprs" WHERE "id" = $1${tenantId ? ' AND "company_id" = $2' : ''} FOR UPDATE NOWAIT`,
        tenantId ? [id, tenantId] : [id],
      );

      if (!rows || rows.length === 0) {
        throw new NotFoundException(`APR com ID ${id} não encontrada`);
      }

      const apr = manager.getRepository(Apr).create(rows[0]);
      return fn(apr, manager);
    });
  }

  async approve(id: string, userId: string, reason?: string): Promise<Apr> {
    const saved = await this.executeAprWorkflowTransition(
      id,
      async (apr, manager) => {
        this.assertAprReadyForApproval(apr);
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
        return manager.getRepository(Apr).save(apr);
      },
    );
    await this.addLog(id, userId, APR_LOG_ACTIONS.APPROVED, {
      ...this.buildAprTraceMetadata(saved),
      motivo: reason,
    });
    this.logger.log({ event: 'apr_approved', aprId: id, userId });
    return saved;
  }

  async reject(id: string, userId: string, reason: string): Promise<Apr> {
    const saved = await this.executeAprWorkflowTransition(
      id,
      async (apr, manager) => {
        this.assertAprWorkflowTransitionAllowed(apr);
        const currentStatus = this.ensureAprStatus(apr.status);
        const allowed = APR_ALLOWED_TRANSITIONS[currentStatus];
        if (!allowed?.includes(AprStatus.CANCELADA)) {
          throw new BadRequestException(
            `Transição inválida: ${currentStatus} → Cancelada. Permitidas: ${allowed?.join(', ') || 'nenhuma'}`,
          );
        }
        const previousStatus = currentStatus;
        apr.status = AprStatus.CANCELADA;
        apr.reprovado_por_id = userId;
        apr.reprovado_em = new Date();
        apr.reprovado_motivo = reason;
        const persisted = await manager.getRepository(Apr).save(apr);
        await this.forensicTrailService.append(
          {
            eventType: FORENSIC_EVENT_TYPES.DOCUMENT_CANCELED,
            module: 'apr',
            entityId: persisted.id,
            companyId: persisted.company_id,
            userId,
            metadata: { previousStatus, currentStatus: persisted.status, reason },
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
    const saved = await this.executeAprWorkflowTransition(
      id,
      async (apr, manager) => {
        this.assertAprReadyForFinalization(apr);
        const currentStatus = this.ensureAprStatus(apr.status);
        const allowed = APR_ALLOWED_TRANSITIONS[currentStatus];
        if (!allowed?.includes(AprStatus.ENCERRADA)) {
          throw new BadRequestException(
            `Transição inválida: ${currentStatus} → Encerrada. Permitidas: ${allowed?.join(', ') || 'nenhuma'}`,
          );
        }
        apr.status = AprStatus.ENCERRADA;
        return manager.getRepository(Apr).save(apr);
      },
    );
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
    return this.aprsPdfService.attachPdf(id, file, userId);
  }

  async generateFinalPdf(
    id: string,
    userId?: string,
  ): Promise<{
    entityId: string;
    generated: boolean;
    hasFinalPdf: boolean;
    availability: AprPdfAccessAvailability;
    message?: string;
    fileKey: string | null;
    folderPath: string | null;
    originalName: string | null;
    url: string | null;
  }> {
    return this.aprsPdfService.generateFinalPdf(id, userId);
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
    return this.aprsEvidenceService.uploadRiskEvidence(
      aprId,
      riskItemId,
      file,
      metadata,
      userId,
      ipAddress,
    );
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
    return this.aprsEvidenceService.verifyEvidenceByHashPublic(hash);
  }

  async listAprEvidences(id: string) {
    return this.aprsEvidenceService.listAprEvidences(id);
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

  async compareVersions(
    baseId: string,
    targetId: string,
  ): Promise<{
    base: { id: string; numero: string; versao: number };
    target: { id: string; numero: string; versao: number };
    summary: {
      totalBase: number;
      totalTarget: number;
      added: number;
      removed: number;
      changed: number;
    };
    added: Array<Record<string, string>>;
    removed: Array<Record<string, string>>;
    changed: Array<{
      index: number;
      before: Record<string, string>;
      after: Record<string, string>;
      changedFields: string[];
    }>;
  }> {
    const [base, target] = await Promise.all([
      this.findOne(baseId),
      this.findOne(targetId),
    ]);

    const baseRootId = base.parent_apr_id ?? base.id;
    const targetRootId = target.parent_apr_id ?? target.id;

    if (baseRootId !== targetRootId) {
      throw new BadRequestException(
        'Só é possível comparar versões da mesma linha documental APR.',
      );
    }

    const baseSnapshots =
      Array.isArray(base.risk_items) && base.risk_items.length > 0
        ? base.risk_items.map((item) =>
            this.mapPersistedRiskItemToSnapshot(item),
          )
        : this.buildAprRiskItemSnapshots({
            itens_risco: base.itens_risco as
              | Array<Record<string, unknown>>
              | undefined,
          });
    const targetSnapshots =
      Array.isArray(target.risk_items) && target.risk_items.length > 0
        ? target.risk_items.map((item) =>
            this.mapPersistedRiskItemToSnapshot(item),
          )
        : this.buildAprRiskItemSnapshots({
            itens_risco: target.itens_risco as
              | Array<Record<string, unknown>>
              | undefined,
          });

    const maxLength = Math.max(baseSnapshots.length, targetSnapshots.length);
    const changed: Array<{
      index: number;
      before: Record<string, string>;
      after: Record<string, string>;
      changedFields: string[];
    }> = [];
    const added: Array<Record<string, string>> = [];
    const removed: Array<Record<string, string>> = [];

    for (let index = 0; index < maxLength; index += 1) {
      const before = baseSnapshots[index];
      const after = targetSnapshots[index];

      if (!before && after) {
        added.push(this.toLegacyRiskItemPayload([{ ...after, ordem: 0 }])[0]);
        continue;
      }

      if (before && !after) {
        removed.push(
          this.toLegacyRiskItemPayload([{ ...before, ordem: 0 }])[0],
        );
        continue;
      }

      if (!before || !after) {
        continue;
      }

      const changedFields = Object.entries({
        atividade_processo: before.atividade !== after.atividade,
        agente_ambiental: before.agente_ambiental !== after.agente_ambiental,
        condicao_perigosa: before.condicao_perigosa !== after.condicao_perigosa,
        fontes_circunstancias:
          before.fonte_circunstancia !== after.fonte_circunstancia,
        possiveis_lesoes: before.lesao !== after.lesao,
        probabilidade: before.probabilidade !== after.probabilidade,
        severidade: before.severidade !== after.severidade,
        categoria_risco: before.categoria_risco !== after.categoria_risco,
        prioridade: before.prioridade !== after.prioridade,
        medidas_prevencao: before.medidas_prevencao !== after.medidas_prevencao,
        responsavel: before.responsavel !== after.responsavel,
        prazo: before.prazo !== after.prazo,
        status_acao: before.status_acao !== after.status_acao,
      })
        .filter(([, hasChanged]) => hasChanged)
        .map(([field]) => field);

      if (changedFields.length > 0) {
        changed.push({
          index,
          before: this.toLegacyRiskItemPayload([{ ...before, ordem: 0 }])[0],
          after: this.toLegacyRiskItemPayload([{ ...after, ordem: 0 }])[0],
          changedFields,
        });
      }
    }

    return {
      base: {
        id: base.id,
        numero: base.numero,
        versao: base.versao ?? 1,
      },
      target: {
        id: target.id,
        numero: target.numero,
        versao: target.versao ?? 1,
      },
      summary: {
        totalBase: baseSnapshots.length,
        totalTarget: targetSnapshots.length,
        added: added.length,
        removed: removed.length,
        changed: changed.length,
      },
      added,
      removed,
      changed,
    };
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

  async previewExcelImport(
    buffer: Buffer,
    fileName: string,
  ): Promise<AprExcelImportPreviewDto> {
    return this.aprExcelService.previewImport(buffer, fileName);
  }

  async exportExcelTemplate(): Promise<Buffer> {
    return this.aprExcelService.buildTemplateWorkbook();
  }

  async exportAprExcel(
    id: string,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const apr = await this.findOne(id);
    return {
      buffer: await this.aprExcelService.buildDetailWorkbook(apr),
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

    return jsonToExcelBuffer(rows, 'APRs');
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
