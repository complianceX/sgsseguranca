import {
  BadRequestException,
  Injectable,
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

  private async findOne(id: string): Promise<Apr> {
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
    return apr;
  }

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
      return 'success';
    }

    if (normalized.includes('ATENCAO') || normalized.includes('INCOMPLETA')) {
      return 'warning';
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
    const signatureCount = signatures.length;
    const totalEvidenceCount = evidences.length;

    const statusTone = this.getAprStatusTone(apr.status);

    // ── Atividades ──────────────────────────────────────────────────────────
    const activities = Array.isArray(apr.activities) ? apr.activities : [];
    const activitiesHtml = activities.length > 0
      ? activities.map((a, i) => `
          <tr>
            <td style="width:28px;text-align:center;color:var(--muted)">${i + 1}</td>
            <td><strong>${this.escapeHtml(a.nome)}</strong></td>
            <td>${this.escapeHtml(a.descricao || '-')}</td>
          </tr>`).join('')
      : `<tr><td colspan="3" style="color:var(--muted)">Nenhuma atividade vinculada.</td></tr>`;

    // ── Riscos do catálogo ───────────────────────────────────────────────────
    const risks = Array.isArray(apr.risks) ? apr.risks : [];
    const risksHtml = risks.length > 0
      ? risks.map((r, i) => `
          <tr>
            <td style="width:28px;text-align:center;color:var(--muted)">${i + 1}</td>
            <td><strong>${this.escapeHtml(r.nome)}</strong></td>
            <td>${this.escapeHtml(r.categoria)}</td>
            <td>${this.escapeHtml(r.medidas_controle || '-')}</td>
          </tr>`).join('')
      : `<tr><td colspan="4" style="color:var(--muted)">Nenhum risco do catálogo vinculado.</td></tr>`;

    // ── EPIs ─────────────────────────────────────────────────────────────────
    const epis = Array.isArray(apr.epis) ? apr.epis : [];
    const episHtml = epis.length > 0
      ? epis.map((e, i) => `
          <tr>
            <td style="width:28px;text-align:center;color:var(--muted)">${i + 1}</td>
            <td><strong>${this.escapeHtml(e.nome)}</strong></td>
            <td>${this.escapeHtml(e.ca || '-')}</td>
            <td>${this.escapeHtml(this.formatAprDisplayDate(e.validade_ca, '-'))}</td>
            <td>${this.escapeHtml(e.descricao || '-')}</td>
          </tr>`).join('')
      : `<tr><td colspan="5" style="color:var(--muted)">Nenhum EPI vinculado.</td></tr>`;

    // ── Ferramentas ───────────────────────────────────────────────────────────
    const tools = Array.isArray(apr.tools) ? apr.tools : [];
    const toolsHtml = tools.length > 0
      ? tools.map((t, i) => `
          <tr>
            <td style="width:28px;text-align:center;color:var(--muted)">${i + 1}</td>
            <td><strong>${this.escapeHtml(t.nome)}</strong></td>
            <td>${this.escapeHtml(t.numero_serie || '-')}</td>
            <td>${this.escapeHtml(t.descricao || '-')}</td>
          </tr>`).join('')
      : '';

    // ── Máquinas ─────────────────────────────────────────────────────────────
    const machines = Array.isArray(apr.machines) ? apr.machines : [];
    const machinesHtml = machines.length > 0
      ? machines.map((m, i) => `
          <tr>
            <td style="width:28px;text-align:center;color:var(--muted)">${i + 1}</td>
            <td><strong>${this.escapeHtml(m.nome)}</strong></td>
            <td>${this.escapeHtml(m.placa || '-')}</td>
            <td>${this.escapeHtml(m.requisitos_seguranca || '-')}</td>
          </tr>`).join('')
      : '';

    // ── Risk items cards ─────────────────────────────────────────────────────
    const riskCardsHtml = riskItems
      .map((item) => {
        const riskTone = this.getAprRiskTone(item.categoria_risco || item.prioridade);
        const categoryTone = this.getAprRiskTone(item.categoria_risco);
        const priorityTone = this.getAprRiskTone(item.prioridade);
        const actionTone = this.getAprActionStatusTone(item.status_acao);
        const evidenceCount = evidenceCountByRiskItem.get(item.id) || 0;
        const planTone = item.medidas_prevencao ? riskTone : 'critical';

        return `
          <article class="risk-card risk-card--${this.escapeHtml(riskTone)}">
            <div class="risk-card__header">
              <div class="risk-card__identity">
                <div class="risk-card__line">Item ${this.escapeHtml(item.ordem + 1)}</div>
                <div class="risk-card__label-row">
                  <span class="label-chip label-chip--activity">Atividade</span>
                </div>
                <div class="risk-card__headline">${this.escapeHtml(item.atividade || 'Atividade não informada')}</div>
              </div>
              <div class="risk-card__matrix">
                <div class="risk-card__matrix-title">
                  <span class="label-chip label-chip--matrix">Matriz P × S</span>
                </div>
                <div class="risk-score risk-score--${this.escapeHtml(riskTone)}">
                  <strong>${this.escapeHtml(item.score_risco ?? '-')}</strong>
                  <span>P ${this.escapeHtml(item.probabilidade ?? '-')} · S ${this.escapeHtml(item.severidade ?? '-')}</span>
                </div>
                <div class="risk-matrix-breakdown">
                  <div class="risk-mini risk-mini--probability">
                    <div class="meta-label meta-label--probability">Prob.</div>
                    <strong>${this.escapeHtml(item.probabilidade ?? '-')}</strong>
                  </div>
                  <div class="risk-mini risk-mini--severity">
                    <div class="meta-label meta-label--severity">Sev.</div>
                    <strong>${this.escapeHtml(item.severidade ?? '-')}</strong>
                  </div>
                </div>
              </div>
            </div>

            <div class="risk-card__signals">
              <span class="status-pill status-pill--${this.escapeHtml(categoryTone)}">Categoria: ${this.escapeHtml(item.categoria_risco || '-')}</span>
              <span class="status-pill status-pill--${this.escapeHtml(priorityTone)}">Prioridade: ${this.escapeHtml(item.prioridade || '-')}</span>
              <span class="status-pill status-pill--${this.escapeHtml(actionTone)}">Ação: ${this.escapeHtml(item.status_acao || '-')}</span>
              ${evidenceCount > 0 ? `<span class="status-pill status-pill--info">${this.escapeHtml(evidenceCount)} evidência${evidenceCount !== 1 ? 's' : ''}</span>` : ''}
            </div>

            <div class="risk-grid risk-grid--3">
              <div class="risk-field risk-field--source">
                <div class="meta-label risk-field__source-label">Fonte / circunstância</div>
                <div class="risk-field__value">${this.escapeHtml(item.fonte_circunstancia || '-')}</div>
              </div>
              <div class="risk-field">
                <div class="meta-label">Agente ambiental</div>
                <div class="risk-field__value">${this.escapeHtml(item.agente_ambiental || '-')}</div>
              </div>
              <div class="risk-field risk-field--danger">
                <div class="label-chip label-chip--danger">Condição / perigo</div>
                <div class="risk-field__value">${this.escapeHtml(item.condicao_perigosa || '-')}</div>
              </div>
            </div>

            <div class="risk-grid" style="margin-top:7px">
              <div class="risk-field">
                <div class="meta-label">Possíveis lesões / danos</div>
                <div class="risk-field__value">${this.escapeHtml(item.lesao || '-')}</div>
              </div>
              <div class="risk-field">
                <div class="meta-label">Responsável pela ação</div>
                <div class="risk-field__value">${this.escapeHtml(item.responsavel || '-')}</div>
              </div>
            </div>

            <div class="risk-plan risk-plan--${this.escapeHtml(planTone)}">
              <div class="label-chip label-chip--control">Medidas de controle e prevenção</div>
              <div class="risk-plan__content">${this.escapeHtml(item.medidas_prevencao || 'Sem medida preventiva cadastrada.')}</div>
            </div>

            <div class="risk-governance">
              <div class="risk-field">
                <div class="meta-label">Prazo</div>
                <div class="risk-field__value">${this.escapeHtml(this.formatAprDisplayDate(item.prazo, 'Não definido'))}</div>
              </div>
              <div class="risk-field">
                <div class="meta-label">Evidências fotográficas anexadas</div>
                <div class="risk-field__value">${this.escapeHtml(evidenceCount)} arquivo${evidenceCount !== 1 ? 's' : ''}</div>
              </div>
            </div>
          </article>
        `;
      })
      .join('');

    // ── Seção aprovação (condicional) ────────────────────────────────────────
    const approvalHtml = apr.aprovado_por
      ? `
        <section class="section">
          <h2 class="section-title">Aprovação</h2>
          <div class="details-grid details-grid--3">
            <div>
              <div class="meta-label">Aprovado por</div>
              <div class="meta-value">${this.escapeHtml(apr.aprovado_por?.nome || '-')}</div>
            </div>
            <div>
              <div class="meta-label">Data de aprovação</div>
              <div class="meta-value">${this.escapeHtml(this.formatAprDisplayDateTime(apr.aprovado_em, '-'))}</div>
            </div>
            <div>
              <div class="meta-label">Resultado</div>
              <div class="meta-value"><span class="status-pill status-pill--success">Aprovada</span></div>
            </div>
          </div>
          ${apr.aprovado_motivo ? `<div class="field-stack"><div class="meta-label">Observações de aprovação</div><div style="margin-top:4px">${this.escapeHtml(apr.aprovado_motivo)}</div></div>` : ''}
        </section>`
      : '';

    // ── Seção auditoria (condicional) ────────────────────────────────────────
    const auditHtml = apr.auditado_por
      ? `
        <section class="section">
          <h2 class="section-title">Auditoria</h2>
          <div class="details-grid details-grid--3">
            <div>
              <div class="meta-label">Auditado por</div>
              <div class="meta-value">${this.escapeHtml(apr.auditado_por?.nome || '-')}</div>
            </div>
            <div>
              <div class="meta-label">Data de auditoria</div>
              <div class="meta-value">${this.escapeHtml(this.formatAprDisplayDate(apr.data_auditoria, '-'))}</div>
            </div>
            <div>
              <div class="meta-label">Resultado</div>
              <div class="meta-value">
                <span class="status-pill status-pill--${apr.resultado_auditoria === 'Conforme' ? 'success' : apr.resultado_auditoria ? 'critical' : 'neutral'}">
                  ${this.escapeHtml(apr.resultado_auditoria || '-')}
                </span>
              </div>
            </div>
          </div>
          ${apr.notas_auditoria ? `<div class="field-stack"><div class="meta-label">Notas de auditoria</div><div style="margin-top:4px">${this.escapeHtml(apr.notas_auditoria)}</div></div>` : ''}
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
              --ink: #25221f;
              --muted: #67615b;
              --line: #d5cec7;
              --surface: #ffffff;
              --surface-soft: #faf8f5;
              --paper: #f6f5f3;
              --neutral: #5c5650;
              --success: #1d6b43;
              --success-soft: #e6f4ec;
              --warning: #9a5a00;
              --warning-soft: #fef5e4;
              --alert: #b65e00;
              --alert-soft: #fff0e0;
              --critical: #b3261e;
              --critical-soft: #fce8e6;
              --info: #145f9c;
              --info-soft: #e8f1fa;
              --activity-accent: var(--info);
              --activity-accent-soft: #e8f1fa;
              --danger-accent: var(--critical);
              --danger-accent-soft: #fce8e6;
              --probability-accent: var(--warning);
              --probability-accent-soft: #fef5e4;
              --severity-accent: var(--alert);
              --severity-accent-soft: #fff0e0;
              --control-accent: var(--success);
              --control-accent-soft: #e6f4ec;
              --source-accent: #4b3f8e;
              --source-accent-soft: #f0eefb;
            }
            * { box-sizing: border-box; }
            body {
              font-family: Arial, Helvetica, sans-serif;
              color: var(--ink);
              font-size: 10px;
              line-height: 1.45;
              margin: 0;
              background: var(--paper);
            }
            h1, h2, h3, p { margin: 0; }
            .page { width: 100%; }

            /* ── HERO ── */
            .hero {
              border: 2px solid var(--line);
              border-radius: 12px;
              padding: 10px 14px;
              background: var(--surface);
              box-shadow: 0 6px 16px rgba(37,34,31,.04);
              margin-bottom: 8px;
            }
            .hero-top {
              display: flex;
              align-items: baseline;
              gap: 12px;
            }
            .hero-title {
              font-size: 18px;
              font-weight: 900;
              color: var(--ink);
              flex: 1;
              min-width: 0;
            }
            .hero-meta {
              display: grid;
              grid-template-columns: repeat(7, minmax(0, 1fr));
              gap: 6px;
              margin-top: 8px;
              padding-top: 8px;
              border-top: 1px solid var(--line);
            }

            /* ── SECTIONS ── */
            .section {
              margin-top: 8px;
              border: 1.5px solid var(--line);
              border-radius: 10px;
              padding: 10px 12px;
              background: var(--surface);
            }
            .section-title {
              display: flex;
              align-items: center;
              gap: 7px;
              font-size: 9.5px;
              font-weight: 900;
              letter-spacing: 0.1em;
              text-transform: uppercase;
              margin-bottom: 7px;
              color: var(--ink);
              padding-bottom: 7px;
              border-bottom: 1px solid var(--line);
            }
            .section-title::before {
              content: '';
              width: 7px; height: 7px;
              border-radius: 999px;
              background: #374151;
              display: inline-block;
              flex-shrink: 0;
            }

            /* ── GRIDS ── */
            .details-grid { display: grid; grid-template-columns: repeat(5, minmax(0,1fr)); gap: 7px 12px; }
            .details-grid--4 { grid-template-columns: repeat(4, minmax(0,1fr)); }
            .details-grid--3 { grid-template-columns: repeat(3, minmax(0,1fr)); }
            .col-full { grid-column: 1 / -1; }
            .field-stack { margin-top: 8px; }

            /* ── META ── */
            .eyebrow { color: var(--muted); font-size: 8.5px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; }
            .meta-label { font-size: 8px; color: var(--muted); font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; }
            .meta-label--probability { color: var(--probability-accent); }
            .meta-label--severity    { color: var(--severity-accent); }
            .meta-value { margin-top: 3px; font-size: 10.5px; font-weight: 800; color: var(--ink); }
            .meta-value--title { font-size: 12px; font-weight: 900; line-height: 1.3; }

            /* ── CHIPS / PILLS ── */
            .label-chip {
              display: inline-flex; align-items: center;
              padding: 2px 7px; border-radius: 999px;
              border: 1px solid var(--line);
              font-size: 7.5px; font-weight: 900; letter-spacing: 0.08em; text-transform: uppercase;
              background: var(--surface); color: var(--ink);
            }
            .label-chip--activity { background: var(--activity-accent-soft); border-color: rgba(20,95,156,.2); color: var(--activity-accent); }
            .label-chip--matrix   { background: #f2efe9; border-color: rgba(92,86,80,.15); color: var(--neutral); }
            .label-chip--danger   { background: var(--danger-accent-soft); border-color: rgba(179,38,30,.18); color: var(--danger-accent); }
            .label-chip--control  { background: var(--control-accent-soft); border-color: rgba(29,107,67,.18); color: var(--control-accent); }
            .label-chip--source   { background: var(--source-accent-soft); border-color: rgba(75,63,142,.18); color: var(--source-accent); }
            .status-pill {
              display: inline-block; padding: 3px 8px; border-radius: 999px;
              border: 1px solid var(--line); font-size: 8.5px; font-weight: 900;
              letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink); background: var(--surface);
            }
            .status-pill--success { border-color: rgba(22,101,52,.25); background: var(--success-soft); color: var(--success); }
            .status-pill--warning { border-color: rgba(146,64,14,.25); background: var(--warning-soft); color: var(--warning); }
            .status-pill--critical{ border-color: rgba(153,27,27,.25); background: var(--critical-soft); color: var(--critical); }
            .status-pill--alert   { border-color: rgba(182,94,0,.24);  background: var(--alert-soft);   color: var(--alert); }
            .status-pill--info    { border-color: rgba(20,95,156,.22); background: var(--info-soft);    color: var(--info); }
            .status-pill--neutral { background: #f0eeea; color: #5c5650; }

            /* ── SUMMARY STRIP (7 cards inline) ── */
            .summary-strip {
              display: grid;
              grid-template-columns: 1.3fr repeat(4,1fr) 1fr 1fr;
              gap: 6px;
            }
            .summary-card {
              border: 1px solid var(--line); border-radius: 9px;
              padding: 6px 8px; background: var(--surface-soft);
              border-top: 3px solid var(--neutral);
            }
            .summary-card strong { display: block; font-size: 15px; line-height: 1.1; margin-top: 2px; color: var(--ink); }
            .summary-card--success { border-top-color: var(--success); background: var(--success-soft); }
            .summary-card--warning { border-top-color: var(--warning); background: var(--warning-soft); }
            .summary-card--alert   { border-top-color: var(--alert);   background: var(--alert-soft); }
            .summary-card--critical{ border-top-color: var(--critical); background: var(--critical-soft); }
            .summary-card--info    { border-top-color: var(--info);    background: var(--info-soft); }

            /* ── PARTICIPANT GRID ── */
            .participant-grid {
              display: grid;
              grid-template-columns: repeat(4, minmax(0,1fr));
              gap: 4px 8px;
            }
            .participant-item {
              border: 1px solid var(--line); border-radius: 7px;
              padding: 5px 8px; font-size: 10px; font-weight: 700;
              background: var(--surface-soft);
            }

            /* ── TABLES ── */
            table { width: 100%; border-collapse: collapse; background: var(--surface); font-size: 9.5px; }
            thead { display: table-header-group; }
            th { background: #ece8e3; color: var(--ink); font-size: 8px; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 900; }
            th, td { border: 1px solid var(--line); padding: 5px 6px; text-align: left; vertical-align: top; word-break: break-word; }
            tbody tr:nth-child(even) { background: #faf8f5; }

            /* ── RISK CARDS ── */
            .risk-list { display: flex; flex-direction: column; gap: 8px; }
            .risk-card {
              border: 1px solid var(--line); border-radius: 11px;
              background: var(--surface); border-top: 3px solid var(--neutral);
              padding: 10px; break-inside: avoid; page-break-inside: avoid;
            }
            .risk-card--success { border-top-color: var(--success); }
            .risk-card--warning { border-top-color: var(--warning); }
            .risk-card--alert   { border-top-color: var(--alert); }
            .risk-card--critical{ border-top-color: var(--critical); }
            .risk-card--info    { border-top-color: var(--info); }
            .risk-card__header { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
            .risk-card__identity { min-width: 0; flex: 1; }
            .risk-card__line { font-size: 8px; color: var(--muted); font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; }
            .risk-card__headline { margin-top: 3px; font-size: 12px; line-height: 1.25; font-weight: 900; color: var(--ink); }
            .risk-card__label-row { margin-top: 3px; }
            .risk-card__matrix { width: 98px; flex-shrink: 0; padding: 7px; border-radius: 9px; border: 1px solid var(--line); background: var(--surface-soft); }
            .risk-card__matrix-title { margin-bottom: 2px; }
            .risk-score { margin-top: 3px; border-radius: 8px; padding: 5px 7px; border: 1px solid var(--line); background: #f0eeea; color: var(--neutral); }
            .risk-score strong { display: block; font-size: 16px; line-height: 1; font-weight: 900; }
            .risk-score span   { display: block; margin-top: 3px; font-size: 8px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; }
            .risk-score--success { border-color: rgba(29,107,67,.18); background: var(--success-soft); color: var(--success); }
            .risk-score--warning { border-color: rgba(154,90,0,.2);   background: var(--warning-soft); color: var(--warning); }
            .risk-score--alert   { border-color: rgba(182,94,0,.22);  background: var(--alert-soft);  color: var(--alert); }
            .risk-score--critical{ border-color: rgba(179,38,30,.2);  background: var(--critical-soft);color: var(--critical); }
            .risk-score--info    { border-color: rgba(20,95,156,.18); background: var(--info-soft);   color: var(--info); }
            .risk-matrix-breakdown { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 4px; margin-top: 5px; }
            .risk-mini { border: 1px solid var(--line); border-radius: 7px; padding: 5px; background: var(--surface); }
            .risk-mini strong { display: block; margin-top: 2px; font-size: 11px; line-height: 1; font-weight: 900; }
            .risk-mini--probability { background: var(--probability-accent-soft); border-color: rgba(154,90,0,.16); color: var(--probability-accent); }
            .risk-mini--severity    { background: var(--severity-accent-soft);    border-color: rgba(182,94,0,.16); color: var(--severity-accent); }
            .risk-card__signals { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 7px; }
            /* Landscape: 4-column grid para os campos de risco */
            .risk-grid { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 6px; margin-top: 7px; }
            .risk-grid--2 { grid-template-columns: repeat(2,minmax(0,1fr)); }
            .risk-governance { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; margin-top: 6px; }
            .risk-field { border: 1px solid var(--line); border-radius: 9px; padding: 7px 8px; background: var(--surface-soft); }
            .risk-field--danger { background: var(--danger-accent-soft); border-color: rgba(179,38,30,.18); }
            .risk-field--source { background: var(--source-accent-soft); border-color: rgba(75,63,142,.18); }
            .risk-field--source .meta-label { color: var(--source-accent); }
            .risk-field__value { margin-top: 3px; color: var(--ink); font-size: 10px; font-weight: 700; line-height: 1.4; }
            .risk-plan {
              margin-top: 7px; border: 1px solid var(--line); border-radius: 9px;
              border-left-width: 4px; padding: 7px 9px; background: var(--surface-soft);
            }
            .risk-plan--success { border-left-color: var(--success); }
            .risk-plan--warning { border-left-color: var(--warning); }
            .risk-plan--alert   { border-left-color: var(--alert); }
            .risk-plan--critical{ border-left-color: var(--critical); }
            .risk-plan--info    { border-left-color: var(--info); }
            .risk-plan--neutral { border-left-color: var(--neutral); }
            .risk-plan__content { margin-top: 3px; font-size: 10px; line-height: 1.5; color: var(--ink); }

            /* ── FOOTER ── */
            .footer { margin-top: 8px; padding-top: 7px; border-top: 1px solid var(--line); color: var(--muted); font-size: 8px; line-height: 1.5; }
          </style>
        </head>
        <body>
          <div class="page">

            <!-- ═══ HERO ═══ -->
            <section class="hero">
              <div class="hero-top">
                <div class="eyebrow">APR · Análise Preliminar de Risco · Documento Técnico Governado — SGS</div>
              </div>
              <h1 class="hero-title">${this.escapeHtml(apr.titulo || 'APR sem título')}</h1>
              <div class="hero-meta">
                <div>
                  <div class="meta-label">Código documental</div>
                  <div class="meta-value">${this.escapeHtml(documentCode)}</div>
                </div>
                <div>
                  <div class="meta-label">Número APR</div>
                  <div class="meta-value">${this.escapeHtml(apr.numero || '-')}</div>
                </div>
                <div>
                  <div class="meta-label">Versão</div>
                  <div class="meta-value">${this.escapeHtml(apr.versao ?? 1)}</div>
                </div>
                <div>
                  <div class="meta-label">Status</div>
                  <div class="meta-value"><span class="status-pill status-pill--${this.escapeHtml(statusTone)}">${this.escapeHtml(apr.status)}</span></div>
                </div>
                <div>
                  <div class="meta-label">Empresa</div>
                  <div class="meta-value">${this.escapeHtml(apr.company?.razao_social || apr.company_id)}</div>
                </div>
                <div>
                  <div class="meta-label">Unidade / Obra</div>
                  <div class="meta-value">${this.escapeHtml(apr.site?.nome || apr.site_id)}</div>
                </div>
                <div>
                  <div class="meta-label">Período</div>
                  <div class="meta-value">${this.escapeHtml(this.formatAprDisplayDate(apr.data_inicio))} – ${this.escapeHtml(this.formatAprDisplayDate(apr.data_fim))}</div>
                </div>
              </div>
            </section>

            <!-- ═══ IDENTIFICAÇÃO OPERACIONAL ═══ -->
            <section class="section">
              <h2 class="section-title">Identificação operacional</h2>
              <div class="details-grid">
                <div>
                  <div class="meta-label">CNPJ</div>
                  <div class="meta-value">${this.escapeHtml(apr.company?.cnpj || '-')}</div>
                </div>
                <div>
                  <div class="meta-label">Elaborador</div>
                  <div class="meta-value">${this.escapeHtml(apr.elaborador?.nome || apr.elaborador_id)}</div>
                </div>
                <div>
                  <div class="meta-label">Aprovado por</div>
                  <div class="meta-value">${this.escapeHtml(apr.aprovado_por?.nome || '-')}</div>
                </div>
                <div>
                  <div class="meta-label">Data de aprovação</div>
                  <div class="meta-value">${this.escapeHtml(this.formatAprDisplayDate(apr.aprovado_em, '-'))}</div>
                </div>
                <div>
                  <div class="meta-label">Emissão</div>
                  <div class="meta-value">${this.escapeHtml(this.formatAprDisplayDate(apr.created_at, '-'))}</div>
                </div>
                ${apr.descricao ? `
                <div class="col-full field-stack">
                  <div class="meta-label">Descrição operacional</div>
                  <div style="margin-top:3px">${this.escapeHtml(apr.descricao)}</div>
                </div>` : ''}
              </div>
            </section>

            <!-- ═══ RESUMO EXECUTIVO ═══ -->
            <section class="section">
              <h2 class="section-title">Resumo executivo de risco</h2>
              <div class="summary-strip">
                <div class="summary-card">
                  <span class="meta-label">Itens avaliados</span>
                  <strong>${this.escapeHtml(summary.total)}</strong>
                </div>
                <div class="summary-card summary-card--success">
                  <span class="meta-label">Aceitável</span>
                  <strong>${this.escapeHtml(summary.aceitavel)}</strong>
                </div>
                <div class="summary-card summary-card--warning">
                  <span class="meta-label">Atenção</span>
                  <strong>${this.escapeHtml(summary.atencao)}</strong>
                </div>
                <div class="summary-card summary-card--alert">
                  <span class="meta-label">Substancial</span>
                  <strong>${this.escapeHtml(summary.substancial)}</strong>
                </div>
                <div class="summary-card summary-card--critical">
                  <span class="meta-label">Crítico</span>
                  <strong>${this.escapeHtml(summary.critico)}</strong>
                </div>
                <div class="summary-card summary-card--info">
                  <span class="meta-label">Assinaturas</span>
                  <strong>${this.escapeHtml(signatureCount)}</strong>
                </div>
                <div class="summary-card">
                  <span class="meta-label">Evidências</span>
                  <strong>${this.escapeHtml(totalEvidenceCount)}</strong>
                </div>
              </div>
            </section>

            <!-- ═══ EQUIPE DE TRABALHO ═══ -->
            <section class="section">
              <h2 class="section-title">Equipe de trabalho — ${this.escapeHtml(participantList.length)} participante${participantList.length !== 1 ? 's' : ''}</h2>
              ${participantList.length > 0
                ? `<div class="participant-grid">${participantList.map((n) => `<div class="participant-item">${this.escapeHtml(n)}</div>`).join('')}</div>`
                : `<div style="color:var(--muted)">Nenhum participante vinculado.</div>`}
            </section>

            <!-- ═══ ATIVIDADES ═══ -->
            <section class="section">
              <h2 class="section-title">Atividades previstas — ${this.escapeHtml(activities.length)}</h2>
              <table>
                <thead><tr><th style="width:24px">#</th><th style="width:32%">Atividade</th><th>Descrição</th></tr></thead>
                <tbody>${activitiesHtml}</tbody>
              </table>
            </section>

            <!-- ═══ EPIs ═══ -->
            <section class="section">
              <h2 class="section-title">Equipamentos de Proteção Individual — EPIs (${this.escapeHtml(epis.length)})</h2>
              <table>
                <thead><tr><th style="width:24px">#</th><th style="width:28%">EPI</th><th style="width:12%">CA</th><th style="width:14%">Validade CA</th><th>Descrição</th></tr></thead>
                <tbody>${episHtml}</tbody>
              </table>
            </section>

            ${tools.length > 0 ? `
            <!-- ═══ FERRAMENTAS ═══ -->
            <section class="section">
              <h2 class="section-title">Ferramentas — ${this.escapeHtml(tools.length)}</h2>
              <table>
                <thead><tr><th style="width:24px">#</th><th style="width:30%">Ferramenta</th><th style="width:20%">Nº de série</th><th>Descrição</th></tr></thead>
                <tbody>${toolsHtml}</tbody>
              </table>
            </section>` : ''}

            ${machines.length > 0 ? `
            <!-- ═══ MÁQUINAS / EQUIPAMENTOS ═══ -->
            <section class="section">
              <h2 class="section-title">Máquinas e equipamentos — ${this.escapeHtml(machines.length)}</h2>
              <table>
                <thead><tr><th style="width:24px">#</th><th style="width:28%">Máquina</th><th style="width:18%">Placa / ID</th><th>Requisitos de segurança</th></tr></thead>
                <tbody>${machinesHtml}</tbody>
              </table>
            </section>` : ''}

            ${risks.length > 0 ? `
            <!-- ═══ RISCOS DO CATÁLOGO ═══ -->
            <section class="section">
              <h2 class="section-title">Riscos do catálogo identificados — ${this.escapeHtml(risks.length)}</h2>
              <table>
                <thead><tr><th style="width:24px">#</th><th style="width:26%">Risco</th><th style="width:16%">Categoria</th><th>Medidas de controle</th></tr></thead>
                <tbody>${risksHtml}</tbody>
              </table>
            </section>` : ''}

            <!-- ═══ ANÁLISE DE RISCO — ITENS ═══ -->
            <section class="section">
              <h2 class="section-title">Análise de risco — itens (${this.escapeHtml(riskItems.length)})</h2>
              <div class="risk-list">
                ${riskCardsHtml || `<div class="risk-card"><div class="risk-plan__content" style="color:var(--muted)">Nenhum item de risco estruturado disponível.</div></div>`}
              </div>
            </section>

            ${approvalHtml}
            ${auditHtml}

            <!-- ═══ ASSINATURAS ═══ -->
            <section class="section">
              <h2 class="section-title">Assinaturas e rastreabilidade</h2>
              <table>
                <thead>
                  <tr><th style="width:40%">Assinante</th><th style="width:18%">Tipo</th><th>Registrada em</th></tr>
                </thead>
                <tbody>
                  ${signatureRows || `<tr><td colspan="3" style="color:var(--muted)">Nenhuma assinatura registrada.</td></tr>`}
                </tbody>
              </table>
            </section>

            <div class="footer">
              Documento técnico governado — emitido pela esteira oficial do SGS &nbsp;·&nbsp;
              Código: ${this.escapeHtml(documentCode)} &nbsp;·&nbsp;
              Última atualização: ${this.escapeHtml(this.formatAprDisplayDateTime(apr.updated_at, '-'))} &nbsp;·&nbsp;
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

    const [signatures, evidences] = await Promise.all([
      this.signaturesService.findByDocument(apr.id, 'APR'),
      this.aprsRepository.manager.getRepository(AprRiskEvidence).find({
        where: { apr_id: apr.id },
        relations: ['apr_risk_item'],
        order: { uploaded_at: 'DESC' },
      }),
    ]);

    const originalName = this.buildAprFinalPdfOriginalName(apr);
    const html = this.renderAprFinalPdfHtml({
      apr,
      documentCode: this.buildAprDocumentCode(apr),
      signatures,
      evidences,
    });
    const buffer = await this.pdfService.generateFromHtml(html, {
      format: 'A4',
      landscape: false,
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
