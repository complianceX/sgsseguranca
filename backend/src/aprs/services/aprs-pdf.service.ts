import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { cleanupUploadedFile } from '../../common/storage/storage-compensation.util';
import { DocumentStorageService } from '../../common/services/document-storage.service';
import { PdfService } from '../../common/services/pdf.service';
import { TenantService } from '../../common/tenant/tenant.service';
import { DocumentGovernanceService } from '../../document-registry/document-governance.service';
import { SignaturesService } from '../../signatures/signatures.service';
import { AprLog } from '../entities/apr-log.entity';
import { AprRiskEvidence } from '../entities/apr-risk-evidence.entity';
import { Apr, AprStatus } from '../entities/apr.entity';
import {
  GovernedPdfAccessAvailability,
  GovernedPdfAccessResponseDto,
} from '../../common/dto/governed-pdf-access-response.dto';

const APR_PDF_LOG_ACTIONS = {
  PDF_ATTACHED: 'APR_PDF_ANEXADO',
  PDF_GENERATED: 'APR_PDF_GERADO',
} as const;

type AprPdfLogAction =
  (typeof APR_PDF_LOG_ACTIONS)[keyof typeof APR_PDF_LOG_ACTIONS];

export type AprPdfAccessAvailability = GovernedPdfAccessAvailability;
type AprPdfAccessResponse = GovernedPdfAccessResponseDto;

@Injectable()
export class AprsPdfService {
  private readonly logger = new Logger(AprsPdfService.name);

  constructor(
    @InjectRepository(Apr)
    private readonly aprsRepository: Repository<Apr>,
    @InjectRepository(AprLog)
    private readonly aprLogsRepository: Repository<AprLog>,
    private readonly tenantService: TenantService,
    private readonly documentStorageService: DocumentStorageService,
    private readonly pdfService: PdfService,
    private readonly documentGovernanceService: DocumentGovernanceService,
    private readonly signaturesService: SignaturesService,
  ) {}

  private ensureAprStatus(status: string): AprStatus {
    const knownStatuses = Object.values(AprStatus);
    if (knownStatuses.includes(status as AprStatus)) {
      return status as AprStatus;
    }

    throw new BadRequestException(`Status de APR inválido: ${status}`);
  }

  private assertAprDocumentMutable(apr: Pick<Apr, 'pdf_file_key'>) {
    if (apr.pdf_file_key) {
      throw new BadRequestException(
        'APR assinada anexada. Edição bloqueada. Crie uma nova versão para alterar.',
      );
    }
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

  private buildAprWhere(id: string): {
    id: string;
    company_id: string;
    site_id?: string;
  } {
    const tenantId = this.tenantService.getTenantId();
    if (!tenantId) {
      throw new InternalServerErrorException(
        'Tenant context ausente em consulta de APR (PdfService.buildAprWhere)',
      );
    }
    const ctx = this.tenantService.getContext();
    const where: { id: string; company_id: string; site_id?: string } = {
      id,
      company_id: tenantId,
    };
    if (ctx?.siteScope === 'single' && ctx.siteId) {
      where.site_id = ctx.siteId;
    }
    return where;
  }

  private async findOne(id: string): Promise<Apr> {
    const apr = await this.aprsRepository.findOne({
      where: this.buildAprWhere(id),
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
    return apr;
  }

  private async findOneForWrite(id: string): Promise<Apr> {
    const apr = await this.aprsRepository.findOne({
      where: this.buildAprWhere(id),
    });
    if (!apr) {
      throw new NotFoundException(`APR com ID ${id} não encontrada`);
    }
    return apr;
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

  private getAprStatusTone(status?: string | null): string {
    switch ((status || '').trim().toUpperCase()) {
      case 'APROVADA':
        return 'success';
      case 'PENDENTE':
        return 'warning';
      case 'CANCELADA':
      case 'REPROVADA':
        return 'critical';
      case 'ENCERRADA':
        return 'neutral';
      default:
        return 'neutral';
    }
  }

  private getAprRiskTone(value?: string | null): string {
    const normalized = String(value || '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    if (!normalized) {
      return 'neutral';
    }

    if (normalized.includes('CRITIC')) {
      return 'critical';
    }

    if (normalized.includes('SUBSTANCIAL')) {
      return 'alert';
    }

    if (normalized.includes('ATENCAO') || normalized.includes('ALERTA')) {
      return 'warning';
    }

    if (
      normalized.includes('ACEITAVEL') ||
      normalized.includes('CONCLUID') ||
      normalized.includes('VALIDAD') ||
      normalized.includes('PRONTA')
    ) {
      return 'success';
    }

    if (
      normalized.includes('OBRIGAT') ||
      normalized.includes('PENDENT') ||
      normalized.includes('ANDAMENTO') ||
      normalized.includes('INSTRUC')
    ) {
      return 'info';
    }

    return 'neutral';
  }

  private getAprActionStatusTone(value?: string | null): string {
    const normalized = String(value || '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    if (!normalized) {
      return 'neutral';
    }

    if (
      normalized.includes('BLOQUE') ||
      normalized.includes('CRITIC') ||
      normalized.includes('IMEDIATA')
    ) {
      return 'critical';
    }

    if (
      normalized.includes('CONCLUID') ||
      normalized.includes('VALIDAD') ||
      normalized.includes('PRONTA')
    ) {
      return 'info';
    }

    if (normalized.includes('ATENCAO') || normalized.includes('INCOMPLETA')) {
      return 'incomplete';
    }

    if (
      normalized.includes('OBRIGAT') ||
      normalized.includes('PENDENT') ||
      normalized.includes('ANDAMENTO') ||
      normalized.includes('AGUARDANDO')
    ) {
      return 'info';
    }

    return 'neutral';
  }

  private normalizeAprRiskItemsForPdf(apr: Apr): Array<{
    id: string;
    ordem: number;
    atividade: string | null;
    etapa: string | null;
    agente_ambiental: string | null;
    condicao_perigosa: string | null;
    fonte_circunstancia: string | null;
    lesao: string | null;
    probabilidade: number | null;
    severidade: number | null;
    score_risco: number | null;
    categoria_risco: string | null;
    prioridade: string | null;
    medidas_prevencao: string | null;
    responsavel: string | null;
    prazo: Date | string | null;
    status_acao: string | null;
    hierarquia_controle?: string | null;
    residual_probabilidade?: number | null;
    residual_severidade?: number | null;
    residual_score?: number | null;
    residual_categoria?: string | null;
  }> {
    const structuredItems = Array.isArray(apr.risk_items) ? apr.risk_items : [];
    if (structuredItems.length > 0) {
      return structuredItems
        .slice()
        .sort((left, right) => left.ordem - right.ordem)
        .map((item) => ({
          id: item.id,
          ordem: item.ordem ?? 0,
          atividade: item.atividade ?? null,
          etapa: item.etapa ?? null,
          agente_ambiental: item.agente_ambiental ?? null,
          condicao_perigosa: item.condicao_perigosa ?? null,
          fonte_circunstancia: item.fonte_circunstancia ?? null,
          lesao: item.lesao ?? null,
          probabilidade: item.probabilidade ?? null,
          severidade: item.severidade ?? null,
          score_risco: item.score_risco ?? null,
          categoria_risco: item.categoria_risco ?? null,
          prioridade: item.prioridade ?? null,
          medidas_prevencao: item.medidas_prevencao ?? null,
          responsavel: item.responsavel ?? null,
          prazo: item.prazo ?? null,
          status_acao: item.status_acao ?? null,
          hierarquia_controle: item.hierarquia_controle ?? null,
          residual_probabilidade: item.residual_probabilidade ?? null,
          residual_severidade: item.residual_severidade ?? null,
          residual_score: item.residual_score ?? null,
          residual_categoria: item.residual_categoria ?? null,
        }));
    }

    const legacyRows = Array.isArray(apr.itens_risco) ? apr.itens_risco : [];
    return legacyRows.map((row, index) => {
      const atividade = String(
        row?.atividade ?? row?.atividade_processo ?? '',
      ).trim();
      const fonte = String(
        row?.fonte_circunstancia ?? row?.fontes_circunstancias ?? '',
      ).trim();
      const lesao = String(row?.lesao ?? row?.possiveis_lesoes ?? '').trim();
      const probabilidadeRaw = Number(row?.probabilidade);
      const severidadeRaw = Number(row?.severidade);
      const probabilidade = Number.isFinite(probabilidadeRaw)
        ? probabilidadeRaw
        : null;
      const severidade = Number.isFinite(severidadeRaw) ? severidadeRaw : null;
      const scoreRaw = Number(row?.score_risco);
      const score = Number.isFinite(scoreRaw)
        ? scoreRaw
        : probabilidade != null && severidade != null
          ? probabilidade * severidade
          : null;

      return {
        id: `legacy-${index}`,
        ordem: index,
        atividade: atividade || null,
        etapa: String(row?.etapa ?? '').trim() || null,
        agente_ambiental: String(row?.agente_ambiental ?? '').trim() || null,
        condicao_perigosa: String(row?.condicao_perigosa ?? '').trim() || null,
        fonte_circunstancia: fonte || null,
        lesao: lesao || null,
        probabilidade,
        severidade,
        score_risco: score,
        categoria_risco: String(row?.categoria_risco ?? '').trim() || null,
        prioridade: String(row?.prioridade ?? '').trim() || null,
        medidas_prevencao: String(row?.medidas_prevencao ?? '').trim() || null,
        responsavel: String(row?.responsavel ?? '').trim() || null,
        prazo: String(row?.prazo ?? '').trim() || null,
        status_acao: String(row?.status_acao ?? '').trim() || null,
        hierarquia_controle:
          String(row?.hierarquia_controle ?? '').trim() || null,
        residual_probabilidade: Number.isFinite(Number(row?.residual_probabilidade))
          ? Number(row?.residual_probabilidade)
          : null,
        residual_severidade: Number.isFinite(Number(row?.residual_severidade))
          ? Number(row?.residual_severidade)
          : null,
        residual_score: Number.isFinite(Number(row?.residual_score))
          ? Number(row?.residual_score)
          : null,
        residual_categoria: String(row?.residual_categoria ?? '').trim() || null,
      };
    });
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
    isSuperseded?: boolean;
  }): string {
    const { apr, documentCode, signatures, evidences, isSuperseded } = input;
    const riskItems = this.normalizeAprRiskItemsForPdf(apr);
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
      aceitavel: riskItems.filter((item) =>
        String(item.categoria_risco || '').toLowerCase().includes('aceit'),
      ).length,
      atencao: riskItems.filter((item) =>
        String(item.categoria_risco || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .includes('atencao'),
      ).length,
      substancial: riskItems.filter((item) =>
        String(item.categoria_risco || '').toLowerCase().includes('subst'),
      ).length,
      critico: riskItems.filter((item) =>
        String(item.categoria_risco || '').toLowerCase().includes('crit'),
      ).length,
    };
    const signatureCount = signatures.length;
    const totalEvidenceCount = evidences.length;
    const complementaryFields = [
      { label: 'Tipo de atividade', value: apr.tipo_atividade },
      { label: 'Frente de trabalho', value: apr.frente_trabalho },
      { label: 'Área de risco', value: apr.area_risco },
      { label: 'Probabilidade global', value: apr.probability },
      { label: 'Severidade global', value: apr.severity },
      { label: 'Exposição global', value: apr.exposure },
      { label: 'Risco inicial', value: apr.initial_risk },
      { label: 'Risco residual', value: apr.residual_risk },
      { label: 'Descrição de controle', value: apr.control_description },
      {
        label: 'Evidência de controle',
        value:
          apr.control_evidence === true
            ? 'Sim'
            : apr.control_evidence === false
              ? 'Não'
              : null,
      },
      { label: 'Evidência fotográfica', value: apr.evidence_photo },
      { label: 'Evidência documental', value: apr.evidence_document },
      { label: 'Reprovado por', value: apr.reprovado_por?.nome },
      {
        label: 'Data de reprovação',
        value: this.formatAprDisplayDateTime(apr.reprovado_em, ''),
      },
      { label: 'Motivo de reprovação', value: apr.reprovado_motivo },
    ].filter(({ value }) => value !== null && value !== undefined && String(value).trim() !== '');
    const complementaryFieldsGridHtml =
      complementaryFields.length > 0
        ? complementaryFields
            .map(
              (field) => `
                <div class="kv-box">
                  <div class="kv-label">${this.escapeHtml(field.label)}</div>
                  <div class="kv-value">${this.escapeHtml(field.value)}</div>
                </div>
              `,
            )
            .join('')
        : '';

    const statusTone = this.getAprStatusTone(apr.status);

    // ── Atividades ──────────────────────────────────────────────────────────
    const activities = Array.isArray(apr.activities) ? apr.activities : [];
    const activitiesHtml =
      activities.length > 0
        ? activities
            .map(
              (a, i) => `
          <tr>
            <td style="width:28px;text-align:center;color:var(--muted)">${i + 1}</td>
            <td><strong>${this.escapeHtml(a.nome)}</strong></td>
            <td>${this.escapeHtml(a.descricao || '-')}</td>
          </tr>`,
            )
            .join('')
        : `<tr><td colspan="3" style="color:var(--muted)">Nenhuma atividade vinculada.</td></tr>`;

    // ── Riscos do catálogo ───────────────────────────────────────────────────
    const risks = Array.isArray(apr.risks) ? apr.risks : [];
    const risksHtml =
      risks.length > 0
        ? risks
            .map(
              (r, i) => `
          <tr>
            <td style="width:28px;text-align:center;color:var(--muted)">${i + 1}</td>
            <td><strong>${this.escapeHtml(r.nome)}</strong></td>
            <td>${this.escapeHtml(r.categoria)}</td>
            <td>${this.escapeHtml(r.medidas_controle || '-')}</td>
          </tr>`,
            )
            .join('')
        : `<tr><td colspan="4" style="color:var(--muted)">Nenhum risco do catálogo vinculado.</td></tr>`;

    // ── EPIs ─────────────────────────────────────────────────────────────────
    const epis = Array.isArray(apr.epis) ? apr.epis : [];
    const episHtml =
      epis.length > 0
        ? epis
            .map(
              (e, i) => `
          <tr>
            <td style="width:28px;text-align:center;color:var(--muted)">${i + 1}</td>
            <td><strong>${this.escapeHtml(e.nome)}</strong></td>
            <td>${this.escapeHtml(e.ca || '-')}</td>
            <td>${this.escapeHtml(this.formatAprDisplayDate(e.validade_ca, '-'))}</td>
            <td>${this.escapeHtml(e.descricao || '-')}</td>
          </tr>`,
            )
            .join('')
        : `<tr><td colspan="5" style="color:var(--muted)">Nenhum EPI vinculado.</td></tr>`;

    // ── Ferramentas ───────────────────────────────────────────────────────────
    const tools = Array.isArray(apr.tools) ? apr.tools : [];
    const toolsHtml =
      tools.length > 0
        ? tools
            .map(
              (t, i) => `
          <tr>
            <td style="width:28px;text-align:center;color:var(--muted)">${i + 1}</td>
            <td><strong>${this.escapeHtml(t.nome)}</strong></td>
            <td>${this.escapeHtml(t.numero_serie || '-')}</td>
            <td>${this.escapeHtml(t.descricao || '-')}</td>
          </tr>`,
            )
            .join('')
        : '';

    // ── Máquinas ─────────────────────────────────────────────────────────────
    const machines = Array.isArray(apr.machines) ? apr.machines : [];
    const machinesHtml =
      machines.length > 0
        ? machines
            .map(
              (m, i) => `
          <tr>
            <td style="width:28px;text-align:center;color:var(--muted)">${i + 1}</td>
            <td><strong>${this.escapeHtml(m.nome)}</strong></td>
            <td>${this.escapeHtml(m.placa || '-')}</td>
            <td>${this.escapeHtml(m.requisitos_seguranca || '-')}</td>
          </tr>`,
            )
            .join('')
        : '';

    const riskTableRowsHtml = riskItems.length
      ? riskItems
          .map((item) => {
            const evidenceCount = evidenceCountByRiskItem.get(item.id) || 0;
            const preventionLines = [
              item.medidas_prevencao,
              item.hierarquia_controle
                ? `Hierarquia: ${item.hierarquia_controle}`
                : null,
              item.responsavel ? `Responsável: ${item.responsavel}` : null,
              item.prazo
                ? `Prazo: ${this.formatAprDisplayDate(item.prazo, '-')}`
                : null,
              item.status_acao ? `Status: ${item.status_acao}` : null,
              item.residual_probabilidade != null ||
              item.residual_severidade != null ||
              item.residual_categoria
                ? `Residual P/S/Cat: ${this.escapeHtml(item.residual_probabilidade ?? '-')}/${this.escapeHtml(item.residual_severidade ?? '-')}/${this.escapeHtml(item.residual_categoria || '-')}`
                : null,
              evidenceCount > 0
                ? `Evidências: ${evidenceCount} arquivo${evidenceCount !== 1 ? 's' : ''}`
                : null,
            ].filter(Boolean);

            return `
              <tr>
                <td class="cell-activity">
                  <strong>${this.escapeHtml(item.atividade || 'Atividade não informada')}</strong>
                  ${item.etapa ? `<div class="cell-helper">Etapa: ${this.escapeHtml(item.etapa)}</div>` : ''}
                </td>
                <td>${this.escapeHtml(item.agente_ambiental || '-')}</td>
                <td>${this.escapeHtml(item.condicao_perigosa || '-')}</td>
                <td>${this.escapeHtml(item.fonte_circunstancia || '-')}</td>
                <td>${this.escapeHtml(item.lesao || '-')}</td>
                <td class="cell-score">${this.escapeHtml(item.probabilidade ?? '-')}</td>
                <td class="cell-score">${this.escapeHtml(item.severidade ?? '-')}</td>
                <td class="risk-level risk-level--${this.escapeHtml(
                  this.getAprRiskTone(item.categoria_risco || item.prioridade),
                )}">${this.escapeHtml(item.categoria_risco || item.prioridade || '-')}</td>
                <td class="cell-prevention">${preventionLines
                  .map((line) => `<div>${this.escapeHtml(line)}</div>`)
                  .join('')}</td>
              </tr>
            `;
          })
          .join('')
      : `
          <tr>
            <td colspan="9" class="empty-state">
              Nenhum item de risco estruturado disponível.
            </td>
          </tr>
        `;

    const riskMatrixHtml = `
      <div class="matrix-layout">
        <table class="matrix-severity-table">
          <thead>
            <tr>
              <th style="width:34%"></th>
              <th style="width:22%">Baixa</th>
              <th style="width:22%">Média</th>
              <th style="width:22%">Alta</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="matrix-axis-title">Severidade</td>
              <td>
                Sem afastamento; danos materiais inexistentes ou leves.
                <div class="matrix-index">1</div>
              </td>
              <td>
                Danos materiais existentes sem perda funcionalidade;
                com afastamento sem incapacidade permanente.
                <div class="matrix-index">2</div>
              </td>
              <td>
                Afastamento com incapacidade permanente parcial ou total ou morte;
                danos materiais com perda da funcionalidade.
                <div class="matrix-index">3</div>
              </td>
            </tr>
          </tbody>
        </table>

        <table class="risk-matrix-table">
          <tbody>
            <tr>
              <td class="matrix-probability-title" rowspan="3">Probabilidade</td>
              <td class="matrix-row-label">Baixa<br />Pouco provável</td>
              <td class="matrix-row-index">1</td>
              <td class="risk-badge risk-badge--acceptable">Aceitável</td>
              <td class="risk-badge risk-badge--acceptable">Aceitável</td>
              <td class="risk-badge risk-badge--attention">De atenção</td>
            </tr>
            <tr>
              <td class="matrix-row-label">Média<br />Provável</td>
              <td class="matrix-row-index">2</td>
              <td class="risk-badge risk-badge--acceptable">Aceitável</td>
              <td class="risk-badge risk-badge--attention">De atenção</td>
              <td class="risk-badge risk-badge--substantial">Substancial</td>
            </tr>
            <tr>
              <td class="matrix-row-label">Alta<br />Esperado que ocorra</td>
              <td class="matrix-row-index">3</td>
              <td class="risk-badge risk-badge--attention">De atenção</td>
              <td class="risk-badge risk-badge--substantial">Substancial</td>
              <td class="risk-badge risk-badge--critical">Crítico</td>
            </tr>
          </tbody>
        </table>

        <p class="matrix-note">
          O resultado deste cruzamento será utilizado para priorização de ações e determinação de controles.
        </p>

        <table class="action-criteria-table">
          <tbody>
            <tr>
              <td class="risk-badge risk-badge--acceptable">Aceitável</td>
              <td><strong>NÃO PRIORITÁRIO</strong><br />Não são requeridos controles adicionais. A condição pode permanecer dentro dos parâmetros verificados.</td>
            </tr>
            <tr>
              <td class="risk-badge risk-badge--attention">De atenção</td>
              <td><strong>PRIORIDADE BÁSICA</strong><br />Reavaliar meios de controle e, quando necessário, adotar medidas complementares.</td>
            </tr>
            <tr>
              <td class="risk-badge risk-badge--substantial">Substancial</td>
              <td><strong>PRIORIDADE PREFERENCIAL</strong><br />O trabalho não deve ser iniciado até que o risco tenha sido reduzido, implantando ações de controle ou corrigindo falhas.</td>
            </tr>
            <tr>
              <td class="risk-badge risk-badge--critical">Crítico</td>
              <td><strong>PRIORIDADE MÁXIMA</strong><br />Interromper o processo, atividade ou tarefa, estabelecendo imediatamente ações de controle até que o risco seja reduzido.</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;

    // ── Seção aprovação (condicional) ────────────────────────────────────────
    const approvalHtml = apr.aprovado_por
      ? `
        <section class="section-card">
          <div class="section-banner section-banner--teal">Aprovação</div>
          <div class="kv-grid kv-grid--3">
            <div class="kv-box">
              <div class="kv-label">Aprovado por</div>
              <div class="kv-value">${this.escapeHtml(apr.aprovado_por?.nome || '-')}</div>
            </div>
            <div class="kv-box">
              <div class="kv-label">Data de aprovação</div>
              <div class="kv-value">${this.escapeHtml(this.formatAprDisplayDateTime(apr.aprovado_em, '-'))}</div>
            </div>
            <div class="kv-box">
              <div class="kv-label">Resultado</div>
              <div class="kv-value"><span class="status-tag status-tag--success">Aprovada</span></div>
            </div>
          </div>
          ${apr.aprovado_motivo ? `<div class="notes-block"><div class="kv-label">Observações de aprovação</div><div class="notes-content">${this.escapeHtml(apr.aprovado_motivo)}</div></div>` : ''}
        </section>`
      : '';

    // ── Seção auditoria (condicional) ────────────────────────────────────────
    const auditHtml = apr.auditado_por
      ? `
        <section class="section-card">
          <div class="section-banner section-banner--teal">Auditoria</div>
          <div class="kv-grid kv-grid--3">
            <div class="kv-box">
              <div class="kv-label">Auditado por</div>
              <div class="kv-value">${this.escapeHtml(apr.auditado_por?.nome || '-')}</div>
            </div>
            <div class="kv-box">
              <div class="kv-label">Data de auditoria</div>
              <div class="kv-value">${this.escapeHtml(this.formatAprDisplayDate(apr.data_auditoria, '-'))}</div>
            </div>
            <div class="kv-box">
              <div class="kv-label">Resultado</div>
              <div class="kv-value">
                <span class="status-tag status-tag--${apr.resultado_auditoria === 'Conforme' ? 'success' : apr.resultado_auditoria ? 'critical' : 'neutral'}">
                  ${this.escapeHtml(apr.resultado_auditoria || '-')}
                </span>
              </div>
            </div>
          </div>
          ${apr.notas_auditoria ? `<div class="notes-block"><div class="kv-label">Notas de auditoria</div><div class="notes-content">${this.escapeHtml(apr.notas_auditoria)}</div></div>` : ''}
        </section>`
      : '';

    return `
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>${this.escapeHtml(apr.titulo || apr.numero || 'APR')}</title>
          <style>
            @page {
              size: A4 landscape;
              margin: 10mm 12mm 12mm 12mm;
            }
            :root {
              color-scheme: light;
              --paper: #ffffff;
              --ink: #111827;
              --muted: #4b5563;
              --line: #000000;
              --soft-line: #9ca3af;
              --teal: #0f8b8d;
              --teal-soft: #f4fbfb;
              --header-gray: #d9d9d9;
              --group-yellow: #ffe699;
              --acceptable: #00b050;
              --attention: #0070c0;
              --substantial: #ffc000;
              --critical: #ff0000;
              --neutral: #f5f5f5;
              --prevention-soft: #eef7ee;
              --row-soft: #f8fbff;
              --score-soft: #fff8dc;
              --success-soft: #e8f5e9;
              --critical-soft: #fdecec;
            }
            * { box-sizing: border-box; }
            body {
              margin: 0;
              background: var(--paper);
              color: var(--ink);
              font-family: Arial, Helvetica, sans-serif;
              font-size: 10px;
              line-height: 1.35;
            }
            h1, h2, h3, p { margin: 0; }
            .page { width: 100%; }
            .stack > * + * { margin-top: 8px; }
            .muted { color: var(--muted); }
            .empty-state { color: var(--muted); text-align: center; padding: 10px; }

            .tech-header {
              border: 1px solid var(--line);
              background: #fff;
            }
            .doc-title-row {
              border-bottom: 1px solid var(--line);
            }
            .doc-title-table,
            .tech-table,
            .apr-risk-table,
            .support-table,
            .signature-table,
            .matrix-severity-table,
            .risk-matrix-table,
            .action-criteria-table {
              width: 100%;
              border-collapse: collapse;
              table-layout: fixed;
            }
            .doc-title-table td {
              border-right: 1px solid var(--line);
              padding: 8px 10px;
              vertical-align: middle;
            }
            .doc-title-table td:last-child { border-right: 0; }
            .doc-title-main {
              text-align: center;
              font-weight: 700;
              font-size: 15px;
            }
            .doc-code-box {
              width: 16%;
              font-size: 8px;
              text-align: center;
            }
            .tech-table td,
            .tech-table th,
            .apr-risk-table td,
            .apr-risk-table th,
            .support-table td,
            .support-table th,
            .signature-table td,
            .signature-table th,
            .matrix-severity-table td,
            .matrix-severity-table th,
            .risk-matrix-table td,
            .action-criteria-table td {
              border: 1px solid var(--line);
              padding: 4px 6px;
              vertical-align: top;
              word-break: break-word;
            }
            .teal-cell {
              background: var(--teal);
              color: #fff;
              font-weight: 700;
              width: 13%;
            }
            .tech-value {
              background: #fff;
            }
            .status-tag {
              display: inline-block;
              padding: 2px 7px;
              border: 1px solid var(--line);
              border-radius: 999px;
              font-size: 8px;
              font-weight: 700;
            }
            .status-tag--success { background: var(--success-soft); }
            .status-tag--critical { background: var(--critical-soft); }
            .status-tag--neutral,
            .status-tag--warning,
            .status-tag--alert,
            .status-tag--info,
            .status-tag--incomplete { background: #f3f4f6; }

            .metrics-grid {
              display: grid;
              grid-template-columns: repeat(7, minmax(0, 1fr));
              gap: 6px;
            }
            .metric-card {
              border: 1px solid #bfd6d7;
              border-radius: 8px;
              background: #fff;
              padding: 8px 9px;
            }
            .metric-bar {
              height: 8px;
              border-radius: 999px;
              margin-bottom: 7px;
              background: var(--teal);
            }
            .metric-card--acceptable .metric-bar { background: var(--acceptable); }
            .metric-card--attention .metric-bar { background: var(--attention); }
            .metric-card--substantial .metric-bar { background: var(--substantial); }
            .metric-card--critical .metric-bar { background: var(--critical); }
            .metric-card--info .metric-bar { background: #2563eb; }
            .metric-label {
              font-size: 8px;
              text-transform: uppercase;
              letter-spacing: .08em;
              color: var(--muted);
              font-weight: 700;
            }
            .metric-value {
              margin-top: 2px;
              font-size: 11px;
              font-weight: 700;
            }

            .section-card {
              border: 1px solid #c7d2da;
              border-radius: 10px;
              background: #fff;
              padding: 0;
              overflow: hidden;
            }
            .section-banner {
              padding: 7px 10px;
              font-size: 10px;
              font-weight: 700;
              border-bottom: 1px solid #dbe4ea;
              background: #eef6f8;
            }
            .section-banner--teal {
              border-left: 8px solid #1d5f9c;
            }
            .section-banner--amber {
              border-left: 8px solid #c06a11;
            }
            .section-body {
              padding: 10px;
            }
            .kv-grid {
              display: grid;
              gap: 8px;
            }
            .kv-grid--3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
            .kv-grid--4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
            .kv-box {
              min-height: 56px;
              border: 1px solid #d8dee6;
              padding: 8px 9px;
              background: #fff;
            }
            .kv-label {
              font-size: 8px;
              text-transform: uppercase;
              letter-spacing: .08em;
              color: #355070;
              font-weight: 700;
            }
            .kv-value {
              margin-top: 5px;
              font-size: 11px;
              font-weight: 700;
              color: var(--ink);
            }
            .notes-block {
              margin-top: 8px;
              border-top: 1px solid #d8dee6;
              padding: 8px 10px 10px;
              background: #fbfdff;
            }
            .notes-content {
              margin-top: 4px;
              white-space: pre-wrap;
            }

            .apr-risk-table thead th {
              text-align: center;
              font-size: 8px;
              font-weight: 700;
            }
            .apr-risk-table .group-header-teal {
              background: var(--teal);
              color: #fff;
            }
            .apr-risk-table .group-header-yellow {
              background: var(--group-yellow);
              color: var(--ink);
            }
            .apr-risk-table .sub-header {
              background: var(--header-gray);
            }
            .apr-risk-table tbody tr:nth-child(even) td {
              background: var(--row-soft);
            }
            .apr-risk-table td.cell-activity {
              width: 14%;
              background: #f9f7f0;
              font-weight: 700;
            }
            .cell-helper {
              margin-top: 3px;
              font-size: 8px;
              color: var(--muted);
              font-weight: 400;
            }
            .apr-risk-table td.cell-score {
              text-align: center;
              font-weight: 700;
              background: var(--score-soft);
            }
            .apr-risk-table td.cell-prevention {
              background: var(--prevention-soft);
            }
            .apr-risk-table td.risk-level {
              text-align: center;
              font-weight: 700;
            }
            .risk-level--success { background: var(--acceptable) !important; color: #fff; }
            .risk-level--warning,
            .risk-level--info { background: var(--attention) !important; color: #fff; }
            .risk-level--alert { background: var(--substantial) !important; color: #111; }
            .risk-level--critical { background: var(--critical) !important; color: #111; }
            .risk-level--neutral,
            .risk-level--incomplete { background: #e5e7eb !important; color: #111; }

            .support-table th {
              background: #eef2f7;
              text-transform: uppercase;
              font-size: 8px;
              letter-spacing: .05em;
            }
            .support-table tbody tr:nth-child(even) td,
            .signature-table tbody tr:nth-child(even) td {
              background: #fafafa;
            }
            .signature-table th {
              background: #1d5f9c;
              color: #fff;
              text-transform: uppercase;
              font-size: 8px;
              letter-spacing: .06em;
            }

            .matrix-layout > * + * { margin-top: 8px; }
            .matrix-severity-table th {
              background: #fff;
              text-align: center;
              font-size: 9px;
              font-weight: 700;
            }
            .matrix-severity-table td {
              text-align: center;
              background: #fff;
            }
            .matrix-axis-title {
              background: var(--header-gray) !important;
              font-weight: 700;
              text-transform: uppercase;
            }
            .matrix-index {
              margin-top: 6px;
              font-size: 9px;
              font-weight: 700;
            }
            .risk-matrix-table td {
              text-align: center;
              font-weight: 700;
            }
            .matrix-probability-title {
              width: 10%;
              background: var(--header-gray);
              writing-mode: vertical-rl;
              transform: rotate(180deg);
              text-transform: uppercase;
            }
            .matrix-row-label,
            .matrix-row-index {
              background: #f5f5f5;
            }
            .risk-badge {
              font-weight: 700;
              text-align: center;
            }
            .risk-badge--acceptable { background: var(--acceptable); color: #fff; }
            .risk-badge--attention { background: var(--attention); color: #fff; }
            .risk-badge--substantial { background: var(--substantial); color: #111; }
            .risk-badge--critical { background: var(--critical); color: #111; }
            .matrix-note {
              font-size: 9px;
              color: var(--muted);
            }
            .action-criteria-table td:first-child {
              width: 19%;
              font-size: 9px;
            }

            .watermark-overlay {
              position: fixed;
              inset: 0;
              pointer-events: none;
              z-index: 9999;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .watermark-text {
              font-size: 72px;
              font-weight: 900;
              color: rgba(179, 38, 30, 0.13);
              text-transform: uppercase;
              letter-spacing: 0.12em;
              transform: rotate(-38deg);
              white-space: nowrap;
            }
            .watermark-banner {
              position: fixed;
              top: 0;
              left: 0;
              right: 0;
              background: rgba(179, 38, 30, 0.85);
              color: #fff;
              font-size: 9px;
              font-weight: 900;
              text-align: center;
              padding: 4px 8px;
              letter-spacing: 0.12em;
              text-transform: uppercase;
              z-index: 10000;
            }
            .footer {
              margin-top: 8px;
              padding-top: 7px;
              border-top: 1px solid #cfd8df;
              color: var(--muted);
              font-size: 8px;
            }
          </style>
        </head>
        <body>
          ${
            isSuperseded
              ? `
          <div class="watermark-banner">
            ⚠ VERSÃO SUPERSEDIDA — Existe uma versão mais recente deste documento. Consulte o sistema para a versão vigente.
          </div>
          <div class="watermark-overlay">
            <div class="watermark-text">Versão Supersedida</div>
          </div>`
              : ''
          }
          <div class="page stack" style="${isSuperseded ? 'margin-top:28px' : ''}">
            <section class="tech-header">
              <div class="doc-title-row">
                <table class="doc-title-table">
                  <tr>
                    <td class="doc-title-main">APR - ANÁLISE PRELIMINAR DE RISCOS</td>
                    <td class="doc-code-box">
                      <div><strong>Código</strong></div>
                      <div>${this.escapeHtml(documentCode)}</div>
                    </td>
                  </tr>
                </table>
              </div>
              <table class="tech-table">
                <tbody>
                  <tr>
                    <td class="teal-cell">Descrição da atividade:</td>
                    <td class="tech-value">${this.escapeHtml(apr.titulo || apr.descricao || '-')}</td>
                    <td class="teal-cell">Empresa:</td>
                    <td class="tech-value">${this.escapeHtml(apr.company?.razao_social || apr.company_id)}</td>
                  </tr>
                  <tr>
                    <td class="teal-cell">Data de elaboração:</td>
                    <td class="tech-value">${this.escapeHtml(this.formatAprDisplayDate(apr.created_at || apr.data_inicio, '-'))}</td>
                    <td class="teal-cell">CNPJ:</td>
                    <td class="tech-value">${this.escapeHtml(apr.company?.cnpj || '-')}</td>
                  </tr>
                  <tr>
                    <td class="teal-cell">Data revisão/ versão:</td>
                    <td class="tech-value">${this.escapeHtml(this.formatAprDisplayDate(apr.updated_at || apr.data_inicio, '-'))} / v${this.escapeHtml(apr.versao ?? 1)}</td>
                    <td class="teal-cell">Responsável:</td>
                    <td class="tech-value">${this.escapeHtml(apr.aprovado_por?.nome || apr.elaborador?.nome || apr.elaborador_id || '-')}</td>
                  </tr>
                  <tr>
                    <td class="teal-cell">Site / obra:</td>
                    <td class="tech-value">${this.escapeHtml(apr.site?.nome || apr.site_id)}</td>
                    <td class="teal-cell">Validade:</td>
                    <td class="tech-value">${this.escapeHtml(this.formatAprDisplayDate(apr.data_inicio, '-'))} a ${this.escapeHtml(this.formatAprDisplayDate(apr.data_fim, '-'))}</td>
                  </tr>
                  <tr>
                    <td class="teal-cell">Status:</td>
                    <td class="tech-value"><span class="status-tag status-tag--${this.escapeHtml(statusTone)}">${this.escapeHtml(apr.status)}</span></td>
                    <td class="teal-cell">Número APR:</td>
                    <td class="tech-value">${this.escapeHtml(apr.numero || '-')}</td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section class="metrics-grid">
              <article class="metric-card"><div class="metric-bar"></div><div class="metric-label">Itens avaliados</div><div class="metric-value">${this.escapeHtml(summary.total)}</div></article>
              <article class="metric-card metric-card--acceptable"><div class="metric-bar"></div><div class="metric-label">Aceitável</div><div class="metric-value">${this.escapeHtml(summary.aceitavel)}</div></article>
              <article class="metric-card metric-card--attention"><div class="metric-bar"></div><div class="metric-label">De atenção</div><div class="metric-value">${this.escapeHtml(summary.atencao)}</div></article>
              <article class="metric-card metric-card--substantial"><div class="metric-bar"></div><div class="metric-label">Substancial</div><div class="metric-value">${this.escapeHtml(summary.substancial)}</div></article>
              <article class="metric-card metric-card--critical"><div class="metric-bar"></div><div class="metric-label">Crítico</div><div class="metric-value">${this.escapeHtml(summary.critico)}</div></article>
              <article class="metric-card metric-card--info"><div class="metric-bar"></div><div class="metric-label">Assinaturas</div><div class="metric-value">${this.escapeHtml(signatureCount)}</div></article>
              <article class="metric-card"><div class="metric-bar"></div><div class="metric-label">Evidências</div><div class="metric-value">${this.escapeHtml(totalEvidenceCount)}</div></article>
            </section>

            <section class="section-card">
              <div class="section-banner section-banner--amber">Reconhecimento de Riscos</div>
              <table class="apr-risk-table">
                <thead>
                  <tr>
                    <th class="group-header-yellow" rowspan="2" style="width:14%">Atividades / Processos</th>
                    <th class="group-header-teal" colspan="4">Reconhecimento de Riscos</th>
                    <th class="group-header-yellow" colspan="3">Avaliação de Riscos</th>
                    <th class="group-header-teal" rowspan="2" style="width:24%">Medidas de Prevenção</th>
                  </tr>
                  <tr>
                    <th class="sub-header" style="width:12%">Agente Ambiental</th>
                    <th class="sub-header" style="width:14%">Condição perigosa</th>
                    <th class="sub-header" style="width:14%">Fontes ou circunstâncias</th>
                    <th class="sub-header" style="width:14%">Possíveis lesões ou agravos à saúde</th>
                    <th class="sub-header" style="width:6%">Probabilidade</th>
                    <th class="sub-header" style="width:6%">Severidade</th>
                    <th class="sub-header" style="width:10%">Categoria de Risco</th>
                  </tr>
                </thead>
                <tbody>
                  ${riskTableRowsHtml}
                </tbody>
              </table>
            </section>

            <section class="section-card">
              <div class="section-banner section-banner--teal">Identificação e contexto</div>
              <div class="section-body">
                <div class="kv-grid kv-grid--4">
                  <div class="kv-box"><div class="kv-label">Elaborador</div><div class="kv-value">${this.escapeHtml(apr.elaborador?.nome || apr.elaborador_id || '-')}</div></div>
                  <div class="kv-box"><div class="kv-label">Aprovado por</div><div class="kv-value">${this.escapeHtml(apr.aprovado_por?.nome || '-')}</div></div>
                  <div class="kv-box"><div class="kv-label">Participantes</div><div class="kv-value">${this.escapeHtml(participantList.length)}</div></div>
                  <div class="kv-box"><div class="kv-label">Período</div><div class="kv-value">${this.escapeHtml(this.formatAprDisplayDate(apr.data_inicio, '-'))} a ${this.escapeHtml(this.formatAprDisplayDate(apr.data_fim, '-'))}</div></div>
                </div>
                ${
                  apr.descricao
                    ? `<div class="notes-block"><div class="kv-label">Descrição operacional</div><div class="notes-content">${this.escapeHtml(apr.descricao)}</div></div>`
                    : ''
                }
                ${
                  complementaryFieldsGridHtml
                    ? `<div class="notes-block"><div class="kv-label">Campos complementares da APR</div><div class="kv-grid kv-grid--4" style="margin-top:8px">${complementaryFieldsGridHtml}</div></div>`
                    : ''
                }
              </div>
            </section>

            <section class="section-card">
              <div class="section-banner section-banner--teal">Participantes (${this.escapeHtml(participantList.length)})</div>
              <table class="support-table">
                <thead>
                  <tr><th style="width:8%">#</th><th>Nome</th></tr>
                </thead>
                <tbody>
                  ${
                    participantList.length
                      ? participantList
                          .map(
                            (name, index) => `
                              <tr>
                                <td>${this.escapeHtml(index + 1)}</td>
                                <td>${this.escapeHtml(name)}</td>
                              </tr>
                            `,
                          )
                          .join('')
                      : `<tr><td colspan="2" class="empty-state">Nenhum participante vinculado.</td></tr>`
                  }
                </tbody>
              </table>
            </section>

            <section class="section-card">
              <div class="section-banner section-banner--teal">Atividades previstas (${this.escapeHtml(activities.length)})</div>
              <table class="support-table">
                <thead><tr><th style="width:8%">#</th><th style="width:32%">Atividade</th><th>Descrição</th></tr></thead>
                <tbody>${activitiesHtml}</tbody>
              </table>
            </section>

            <section class="section-card">
              <div class="section-banner section-banner--teal">Equipamentos de Proteção Individual — EPIs (${this.escapeHtml(epis.length)})</div>
              <table class="support-table">
                <thead><tr><th style="width:8%">#</th><th style="width:28%">EPI</th><th style="width:12%">CA</th><th style="width:14%">Validade CA</th><th>Descrição</th></tr></thead>
                <tbody>${episHtml}</tbody>
              </table>
            </section>

            ${
              tools.length > 0
                ? `
            <section class="section-card">
              <div class="section-banner section-banner--teal">Ferramentas (${this.escapeHtml(tools.length)})</div>
              <table class="support-table">
                <thead><tr><th style="width:8%">#</th><th style="width:30%">Ferramenta</th><th style="width:20%">Nº de série</th><th>Descrição</th></tr></thead>
                <tbody>${toolsHtml}</tbody>
              </table>
            </section>`
                : ''
            }

            ${
              machines.length > 0
                ? `
            <section class="section-card">
              <div class="section-banner section-banner--teal">Máquinas e equipamentos (${this.escapeHtml(machines.length)})</div>
              <table class="support-table">
                <thead><tr><th style="width:8%">#</th><th style="width:28%">Máquina</th><th style="width:18%">Placa / ID</th><th>Requisitos de segurança</th></tr></thead>
                <tbody>${machinesHtml}</tbody>
              </table>
            </section>`
                : ''
            }

            ${
              risks.length > 0
                ? `
            <section class="section-card">
              <div class="section-banner section-banner--teal">Riscos do catálogo identificados (${this.escapeHtml(risks.length)})</div>
              <table class="support-table">
                <thead><tr><th style="width:8%">#</th><th style="width:26%">Risco</th><th style="width:16%">Categoria</th><th>Medidas de controle</th></tr></thead>
                <tbody>${risksHtml}</tbody>
              </table>
            </section>`
                : ''
            }

            <section class="section-card">
              <div class="section-banner section-banner--amber">Matriz de risco e critério de ação</div>
              <div class="section-body">
                ${riskMatrixHtml}
              </div>
            </section>

            ${approvalHtml}
            ${auditHtml}

            <section class="section-card">
              <div class="section-banner section-banner--teal">Assinaturas registradas</div>
              <table class="signature-table">
                <thead>
                  <tr><th style="width:40%">Assinante</th><th style="width:18%">Tipo</th><th>Registrada em</th></tr>
                </thead>
                <tbody>
                  ${signatureRows || `<tr><td colspan="3" class="empty-state">Nenhuma assinatura registrada.</td></tr>`}
                </tbody>
              </table>
            </section>

            <div class="footer">
              Documento técnico governado — emitido pela esteira oficial do SGS ·
              Código: ${this.escapeHtml(documentCode)} ·
              Última atualização: ${this.escapeHtml(this.formatAprDisplayDateTime(apr.updated_at, '-'))} ·
              Gerado em: ${this.escapeHtml(this.formatAprDisplayDateTime(new Date(), '-'))}
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private async addLog(
    aprId: string,
    userId: string | undefined,
    acao: AprPdfLogAction,
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

  private async getPdfAccess(id: string): Promise<AprPdfAccessResponse> {
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
    let message: string | null = null;
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

  async storeFinalPdfBuffer(
    apr: Apr,
    input: {
      buffer: Buffer;
      originalName: string;
      mimeType: string;
      userId?: string;
      logAction?: AprPdfLogAction;
    },
  ): Promise<{ fileKey: string; folderPath: string; originalName: string }> {
    const key = this.documentStorageService.generateDocumentKey(
      apr.company_id,
      'aprs',
      apr.id,
      input.originalName,
    );
    await this.documentStorageService.uploadFile(
      key,
      input.buffer,
      input.mimeType,
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
        originalName: input.originalName,
        mimeType: input.mimeType,
        createdBy: input.userId,
        fileBuffer: input.buffer,
        persistEntityMetadata: async (manager) => {
          await manager.getRepository(Apr).update(apr.id, {
            pdf_file_key: key,
            pdf_folder_path: folder,
            pdf_original_name: input.originalName,
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

    await this.addLog(
      apr.id,
      input.userId,
      input.logAction ?? APR_PDF_LOG_ACTIONS.PDF_ATTACHED,
      {
        fileKey: key,
        originalName: input.originalName,
      },
    );

    return {
      fileKey: key,
      folderPath: folder,
      originalName: input.originalName,
    };
  }

  async attachPdf(
    id: string,
    file: Express.Multer.File,
    userId?: string,
  ): Promise<{ fileKey: string; folderPath: string; originalName: string }> {
    const apr = await this.findOne(id);
    await this.assertAprReadyForFinalPdf(apr);
    return this.storeFinalPdfBuffer(apr, {
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      userId,
      logAction: APR_PDF_LOG_ACTIONS.PDF_ATTACHED,
    });
  }

  /**
   * Regenera o PDF de uma APR que acabou de ser supersedida por uma nova versão,
   * adicionando a marca d'água "VERSÃO SUPERSEDIDA". Chamado por createNewVersion.
   * É idempotente — se o APR não tiver PDF ou falhar, o erro é silenciado.
   */
  async regeneratePdfWithSupersededWatermark(
    parentAprId: string,
    userId?: string,
  ): Promise<void> {
    try {
      const apr = await this.findOneForWrite(parentAprId);
      if (!apr.pdf_file_key) {
        return;
      }
      const full = await this.findOne(parentAprId);
      const [signatures, evidences] = await Promise.all([
        this.signaturesService.findByDocument(full.id, 'APR'),
        this.aprsRepository.manager.getRepository(AprRiskEvidence).find({
          where: { apr_id: full.id },
          relations: ['apr_risk_item'],
          order: { uploaded_at: 'DESC' },
        }),
      ]);
      const html = this.renderAprFinalPdfHtml({
        apr: full,
        documentCode: this.buildAprDocumentCode(full),
        signatures,
        evidences,
        isSuperseded: true,
      });
      const buffer = await this.pdfService.generateFromHtml(html, {
        format: 'A4',
        landscape: true,
        preferCssPageSize: true,
      });
      const originalName = this.buildAprFinalPdfOriginalName(full);
      await this.storeFinalPdfBuffer(full, {
        buffer,
        originalName,
        mimeType: 'application/pdf',
        userId,
        logAction: APR_PDF_LOG_ACTIONS.PDF_GENERATED,
      });
    } catch (err) {
      this.logger.warn(
        `Falha ao regenerar PDF com marca d'água de APR supersedida (${parentAprId}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async generateFinalPdf(
    id: string,
    userId?: string,
  ): Promise<AprPdfAccessResponse & { generated: boolean }> {
    const existingAccess = await this.getPdfAccess(id);
    if (existingAccess.hasFinalPdf) {
      return {
        ...existingAccess,
        generated: false,
      };
    }

    const apr = await this.findOne(id);
    await this.assertAprReadyForFinalPdf(apr);

    const [signatures, evidences, supersedingRow] = await Promise.all([
      this.signaturesService.findByDocument(apr.id, 'APR'),
      this.aprsRepository.manager.getRepository(AprRiskEvidence).find({
        where: { apr_id: apr.id },
        relations: ['apr_risk_item'],
        order: { uploaded_at: 'DESC' },
      }),
      this.aprsRepository.findOne({
        where: { parent_apr_id: apr.id },
        select: ['id'],
      }),
    ]);

    const originalName = this.buildAprFinalPdfOriginalName(apr);
    const html = this.renderAprFinalPdfHtml({
      apr,
      documentCode: this.buildAprDocumentCode(apr),
      signatures,
      evidences,
      isSuperseded: supersedingRow != null,
    });
    const buffer = await this.pdfService.generateFromHtml(html, {
      format: 'A4',
      landscape: true,
      preferCssPageSize: true,
    });

    await this.storeFinalPdfBuffer(apr, {
      buffer,
      originalName,
      mimeType: 'application/pdf',
      userId,
      logAction: APR_PDF_LOG_ACTIONS.PDF_GENERATED,
    });

    return {
      ...(await this.getPdfAccess(id)),
      generated: true,
    };
  }
}
