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

const APR_PDF_LOG_ACTIONS = {
  PDF_ATTACHED: 'APR_PDF_ANEXADO',
  PDF_GENERATED: 'APR_PDF_GERADO',
} as const;

type AprPdfLogAction =
  (typeof APR_PDF_LOG_ACTIONS)[keyof typeof APR_PDF_LOG_ACTIONS];

export type AprPdfAccessAvailability =
  | 'ready'
  | 'registered_without_signed_url'
  | 'not_emitted';

type AprPdfAccessResponse = {
  entityId: string;
  hasFinalPdf: boolean;
  availability: AprPdfAccessAvailability;
  message?: string;
  fileKey: string | null;
  folderPath: string | null;
  originalName: string | null;
  url: string | null;
};

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

    const summaryCards = [
      {
        label: 'Itens avaliados',
        value: summary.total,
        tone: 'neutral',
      },
      {
        label: 'Aceitável',
        value: summary.aceitavel,
        tone: 'success',
      },
      {
        label: 'Atenção',
        value: summary.atencao,
        tone: 'warning',
      },
      {
        label: 'Substancial',
        value: summary.substancial,
        tone: 'alert',
      },
      {
        label: 'Crítico',
        value: summary.critico,
        tone: 'critical',
      },
    ];

    const summaryCardsHtml = summaryCards
      .map(
        (card) => `
          <div class="summary-card summary-card--${card.tone}">
            <span class="meta-label">${this.escapeHtml(card.label)}</span>
            <strong>${this.escapeHtml(card.value)}</strong>
          </div>
        `,
      )
      .join('');

    const statusTone = this.getAprStatusTone(apr.status);

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
              --ink: #25221f;
              --muted: #67615b;
              --line: #d5cec7;
              --surface: #ffffff;
              --surface-soft: #faf8f5;
              --paper: #f6f5f3;
              --neutral: #5c5650;
              --success: #1d6b43;
              --success-soft: color-mix(in srgb, #1d6b43 11%, white 89%);
              --warning: #9a5a00;
              --warning-soft: color-mix(in srgb, #9a5a00 12%, white 88%);
              --alert: #b65e00;
              --alert-soft: color-mix(in srgb, #b65e00 12%, white 88%);
              --critical: #b3261e;
              --critical-soft: color-mix(in srgb, #b3261e 10%, white 90%);
            }
            * {
              box-sizing: border-box;
            }
            body {
              font-family: Arial, Helvetica, sans-serif;
              color: var(--ink);
              font-size: 11px;
              line-height: 1.45;
              margin: 0;
              background: var(--paper);
            }
            h1, h2, h3, p {
              margin: 0;
            }
            .page {
              width: 100%;
            }
            .hero {
              border: 2px solid var(--line);
              border-radius: 14px;
              padding: 16px 18px;
              background: var(--surface);
              box-shadow: 0 10px 28px rgba(37, 34, 31, 0.05);
              margin-bottom: 16px;
            }
            .eyebrow {
              color: var(--muted);
              font-size: 9px;
              font-weight: 800;
              letter-spacing: 0.16em;
              text-transform: uppercase;
            }
            .hero-grid {
              display: grid;
              grid-template-columns: 1.55fr 0.95fr;
              gap: 14px;
              margin-top: 8px;
            }
            .hero-title {
              font-size: 23px;
              line-height: 1.12;
              font-weight: 900;
              margin-top: 8px;
              color: var(--ink);
            }
            .hero-subtitle {
              margin-top: 6px;
              color: var(--muted);
              font-size: 12px;
            }
            .meta-panel {
              border: 1px solid var(--line);
              border-radius: 12px;
              padding: 12px;
              background: var(--surface-soft);
            }
            .meta-grid {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 10px;
            }
            .meta-label {
              font-size: 9px;
              color: var(--muted);
              font-weight: 800;
              letter-spacing: 0.1em;
              text-transform: uppercase;
            }
            .meta-value {
              margin-top: 4px;
              font-size: 11px;
              font-weight: 800;
              color: var(--ink);
            }
            .meta-value--title {
              font-size: 13px;
              font-weight: 900;
              line-height: 1.3;
            }
            .status-pill {
              display: inline-block;
              padding: 4px 10px;
              border-radius: 999px;
              border: 1px solid var(--line);
              font-size: 9px;
              font-weight: 900;
              letter-spacing: 0.08em;
              text-transform: uppercase;
              color: var(--ink);
              background: var(--surface);
            }
            .status-pill--success {
              border-color: rgba(22, 101, 52, 0.25);
              background: var(--success-soft);
              color: var(--success);
            }
            .status-pill--warning {
              border-color: rgba(146, 64, 14, 0.25);
              background: var(--warning-soft);
              color: var(--warning);
            }
            .status-pill--critical {
              border-color: rgba(153, 27, 27, 0.25);
              background: var(--critical-soft);
              color: var(--critical);
            }
            .status-pill--neutral {
              background: #f0eeea;
              color: #5c5650;
            }
            .field-stack {
              margin-top: 12px;
            }
            .section {
              margin-top: 14px;
              border: 1.5px solid var(--line);
              border-radius: 12px;
              padding: 14px;
              background: var(--surface);
              break-inside: avoid;
              page-break-inside: avoid;
            }
            .section-title {
              display: flex;
              align-items: center;
              gap: 8px;
              font-size: 12px;
              font-weight: 900;
              letter-spacing: 0.08em;
              text-transform: uppercase;
              margin-bottom: 10px;
              color: var(--ink);
              padding-bottom: 9px;
              border-bottom: 1px solid var(--line);
            }
            .section-title::before {
              content: '';
              width: 8px;
              height: 8px;
              border-radius: 999px;
              background: #374151;
              display: inline-block;
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
              border: 1px solid var(--line);
              border-radius: 10px;
              padding: 10px 12px;
              background: var(--surface-soft);
              border-top: 3px solid var(--neutral);
            }
            .summary-card strong {
              display: block;
              font-size: 19px;
              line-height: 1.1;
              margin-top: 4px;
              color: var(--ink);
            }
            .summary-card--success {
              border-top-color: var(--success);
              background: var(--success-soft);
            }
            .summary-card--warning {
              border-top-color: var(--warning);
              background: var(--warning-soft);
            }
            .summary-card--alert {
              border-top-color: var(--alert);
              background: var(--alert-soft);
            }
            .summary-card--critical {
              border-top-color: var(--critical);
              background: var(--critical-soft);
            }
            table {
              width: 100%;
              border-collapse: collapse;
              border: 1px solid var(--line);
              background: var(--surface);
            }
            thead {
              display: table-header-group;
            }
            th {
              background: #ece8e3;
              color: var(--ink);
              font-size: 9px;
              text-transform: uppercase;
              letter-spacing: 0.06em;
              font-weight: 900;
            }
            th, td {
              border: 1px solid var(--line);
              padding: 6px 7px;
              text-align: left;
              vertical-align: top;
              word-break: break-word;
            }
            tbody tr:nth-child(even) {
              background: #faf8f5;
            }
            .participants {
              margin: 0;
              padding-left: 16px;
              color: var(--ink);
            }
            .participants li {
              margin-bottom: 2px;
            }
            .footer {
              margin-top: 12px;
              padding-top: 10px;
              border-top: 1px solid var(--line);
              color: var(--muted);
              font-size: 10px;
              line-height: 1.5;
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
                      <div class="meta-value">
                        <span class="status-pill status-pill--${this.escapeHtml(statusTone)}">${this.escapeHtml(apr.status)}</span>
                      </div>
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
              <div class="field-stack">
                <div class="meta-label">Título</div>
                <div class="meta-value meta-value--title">${this.escapeHtml(apr.titulo || '-')}</div>
              </div>
              <div class="field-stack">
                <div class="meta-label">Descrição</div>
                <div>${this.escapeHtml(apr.descricao || 'Sem descrição operacional complementar.')}</div>
              </div>
              <div class="field-stack">
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
              <div class="summary-grid">${summaryCardsHtml}</div>
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
    const buffer = await this.pdfService.generateFromHtml(html);

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
