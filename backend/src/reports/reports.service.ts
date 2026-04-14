import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Apr } from '../aprs/entities/apr.entity';
import { Checklist } from '../checklists/entities/checklist.entity';
import { Report } from './entities/report.entity';
import { PdfService } from '../common/services/pdf.service';
import { TenantService } from '../common/tenant/tenant.service';
import { CompaniesService } from '../companies/companies.service';
import { Dds } from '../dds/entities/dds.entity';
import { Epi } from '../epis/entities/epi.entity';
import { Pt } from '../pts/entities/pt.entity';
import { Training } from '../trainings/entities/training.entity';
import {
  normalizeOffsetPagination,
  OffsetPage,
  toOffsetPage,
} from '../common/utils/offset-pagination.util';
import * as fs from 'fs';
import * as path from 'path';

type MonthlyReportStats = {
  aprs_count: number;
  pts_count: number;
  dds_count: number;
  checklists_count: number;
  trainings_count: number;
  epis_expired_count: number;
};

type MonthlyReportDateColumn =
  | 'data_inicio'
  | 'data_hora_inicio'
  | 'data'
  | 'data_conclusao'
  | 'validade_ca';

type MonthRange = {
  monthStart: string;
  nextMonth: string;
};

const MONTHLY_REPORT_DATE_COLUMNS = new Set<MonthlyReportDateColumn>([
  'data_inicio',
  'data_hora_inicio',
  'data',
  'data_conclusao',
  'validade_ca',
]);

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);
  private monthlyReportTemplate: string;

  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    @InjectRepository(Apr)
    private readonly aprsRepository: Repository<Apr>,
    @InjectRepository(Checklist)
    private readonly checklistsRepository: Repository<Checklist>,
    @InjectRepository(Dds)
    private readonly ddsRepository: Repository<Dds>,
    @InjectRepository(Epi)
    private readonly episRepository: Repository<Epi>,
    @InjectRepository(Pt)
    private readonly ptsRepository: Repository<Pt>,
    @InjectRepository(Training)
    private readonly trainingsRepository: Repository<Training>,
    private readonly pdfService: PdfService,
    private readonly tenantService: TenantService,
    private readonly companiesService: CompaniesService,
  ) {
    this.loadTemplates();
  }

  private getTenantContextOrThrow(): {
    companyId: string;
    siteId?: string;
    siteScope: 'single' | 'all';
    isSuperAdmin: boolean;
  } {
    const context = this.tenantService.getContext();
    if (!context?.companyId) {
      throw new BadRequestException('Contexto de empresa nao definido.');
    }

    const siteScope = context.siteScope ?? 'single';
    if (siteScope === 'single' && !context.siteId) {
      throw new BadRequestException('Contexto de obra nao definido.');
    }

    return {
      companyId: context.companyId,
      siteId: context.siteId,
      siteScope,
      isSuperAdmin: context.isSuperAdmin,
    };
  }

  private resolveMonthlyTemplatePath(): string | null {
    const fileName = 'monthly-report.template.html';
    const candidates = [
      path.join(__dirname, 'templates', fileName),
      path.join(process.cwd(), 'dist', 'reports', 'templates', fileName),
      path.join(process.cwd(), 'src', 'reports', 'templates', fileName),
      path.join(
        process.cwd(),
        'backend',
        'src',
        'reports',
        'templates',
        fileName,
      ),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  private buildFallbackMonthlyTemplate(): string {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Relatório Mensal SST</title>
  <style>
    @page { size: A4; margin: 0; }
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color: #25221f; margin: 0; padding: 0; background: #fff; }
    .page { width: 210mm; min-height: 297mm; padding: 14mm; display: flex; flex-direction: column; }
    .header { margin: -14mm -14mm 0; padding: 14mm 14mm 10mm; background: #2c2825; color: #fff; border-bottom: 2.6mm solid #3e3935; position: relative; min-height: 36mm; }
    .title { font-size: 16pt; font-weight: 700; margin: 0; }
    .subtitle { color: #c4bcb6; font-size: 9.5pt; margin: 4px 0 0; }
    .document-chip { position: absolute; top: 10mm; right: 14mm; width: 52mm; background: #fff; color: #25221f; border-radius: 6px; padding: 8px 10px; }
    .document-chip .k { font-size: 7pt; text-transform: uppercase; letter-spacing: .08em; color: #8f8882; font-weight: 700; }
    .document-chip .v { margin-top: 6px; font-size: 11pt; font-weight: 700; }
    .document-chip .m { margin-top: 4px; font-size: 7.5pt; color: #67615b; }
    .body { flex-grow: 1; padding-top: 8mm; }
    .meta-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 12px; break-inside: avoid; page-break-inside: avoid; }
    .meta { background: #f6f5f3; border: 1px solid #d5cec7; border-radius: 6px; padding: 10px 12px; }
    .meta .k { color: #8f8882; font-size: 7.3pt; text-transform: uppercase; letter-spacing: .08em; font-weight: 700; margin-bottom: 5px; display: block; }
    .meta .v { font-weight: 700; font-size: 10pt; color: #25221f; display: block; line-height: 1.35; }
    .strip { display: grid; grid-template-columns: 1.3fr repeat(3, minmax(0, 1fr)); gap: 10px; background: #f6f5f3; border: 1px solid #d5cec7; border-radius: 8px; margin-bottom: 12px; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
    .strip-summary { border-left: 4px solid #1d6b43; padding: 12px 14px; }
    .strip-summary .t { font-size: 10.5pt; font-weight: 700; color: #25221f; margin-bottom: 4px; }
    .strip-summary .b { font-size: 8.6pt; line-height: 1.45; color: #57534e; }
    .pill { background: #fff; border-left: 4px solid #3e3935; padding: 10px 12px; display: flex; flex-direction: column; justify-content: center; }
    .pill.success { border-left-color: #1d6b43; }
    .pill.warning { border-left-color: #9a5a00; }
    .pill.danger { border-left-color: #b3261e; }
    .pill .k { font-size: 7pt; text-transform: uppercase; letter-spacing: .08em; font-weight: 700; color: #8f8882; margin-bottom: 5px; }
    .pill .v { font-size: 13pt; font-weight: 700; color: #25221f; }
    h2 { margin: 14px 0 8px; font-size: 11pt; color: #25221f; }
    .stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-bottom: 12px; break-inside: avoid; page-break-inside: avoid; }
    .stat-card { background: #f6f5f3; border: 1px solid #d5cec7; border-left: 4px solid #3e3935; border-radius: 6px; padding: 12px 14px; min-height: 72px; }
    .stat-card.primary { border-left-color: #3e3935; }
    .stat-card.success { border-left-color: #1d6b43; }
    .stat-card.warning { border-left-color: #9a5a00; }
    .stat-card.danger { border-left-color: #b3261e; }
    .stat-card .value { font-size: 19pt; font-weight: 700; color: #2c2825; margin-bottom: 4px; }
    .stat-card .label { font-size: 8.3pt; color: #67615b; font-weight: 600; line-height: 1.35; }
    .analysis { margin-top: 0; border: 1px solid #d5cec7; border-radius: 6px; background: #f6f5f3; padding: 14px; overflow-wrap: anywhere; word-break: break-word; }
    .analysis .t { font-size: 10.5pt; font-weight: 700; margin-bottom: 8px; color: #25221f; }
    .analysis pre { white-space: pre-wrap; font-family: inherit; margin: 0; line-height: 1.65; font-size: 9.6pt; overflow-wrap: anywhere; word-break: break-word; }
    .governance { margin-top: 12px; background: #f0ede9; border: 1px solid #d5cec7; border-radius: 6px; padding: 10px 12px; break-inside: avoid; page-break-inside: avoid; }
    .governance .k { font-size: 7.2pt; text-transform: uppercase; letter-spacing: .08em; font-weight: 700; color: #8f8882; margin-bottom: 4px; }
    .governance .v { font-size: 8.5pt; color: #57534e; line-height: 1.45; }
    .footer { margin-top: auto; display: flex; justify-content: space-between; border-top: 1px solid #d5cec7; padding-top: 10mm; font-size: 8pt; color: #8f8882; break-inside: avoid; page-break-inside: avoid; }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <h1 class="title">Relatório SGS - {{periodo}}</h1>
      <div class="subtitle">Relatório executivo de desempenho documental e conformidade</div>
      <div class="document-chip">
        <div class="k">Emissão documental</div>
        <div class="v">{{periodo}}</div>
        <div class="m">{{dataEmissao}}</div>
      </div>
    </div>

    <div class="body">
      <div class="meta-grid">
        <div class="meta"><span class="k">Empresa</span><span class="v">{{companyName}}</span></div>
        <div class="meta"><span class="k">Documento</span><span class="v">{{documentTitle}}</span></div>
        <div class="meta"><span class="k">Período</span><span class="v">{{periodo}}</span></div>
        <div class="meta"><span class="k">Emissão</span><span class="v">{{dataEmissao}}</span></div>
      </div>

      <div class="strip">
        <div class="strip-summary">
          <div class="t">Leitura executiva do período</div>
          <div class="b">Síntese rápida da movimentação documental, capacitação e foco corretivo do fechamento mensal.</div>
        </div>
        <div class="pill">
          <div class="k">Registros</div>
          <div class="v">{{operational_total}}</div>
        </div>
        <div class="pill {{training_tone}}">
          <div class="k">Treinamentos</div>
          <div class="v">{{trainings_count}}</div>
        </div>
        <div class="pill {{status_tone}}">
          <div class="k">Status</div>
          <div class="v">{{status_signal}}</div>
        </div>
      </div>

      <h2>Indicadores mensais</h2>
      <div class="stats">
        {{stats_cards}}
      </div>

      <div class="analysis">
        <div class="t">Análise e recomendações</div>
        <pre>{{analise_gandra}}</pre>
      </div>

      <div class="governance">
        <div class="k">Governança documental</div>
        <div class="v">{{governance_note}}</div>
      </div>
    </div>

    <div class="footer">
      <span>SGS — Sistema de Gestão de Segurança</span>
      <span>Documento confidencial | Emissão digital</span>
    </div>
  </div>
</body>
</html>`;
  }

  private loadTemplates() {
    try {
      const templatePath = this.resolveMonthlyTemplatePath();
      if (!templatePath) {
        this.logger.warn(
          'Template mensal não encontrado em disco. Usando template fallback embutido.',
        );
        this.monthlyReportTemplate = this.buildFallbackMonthlyTemplate();
        return;
      }

      this.monthlyReportTemplate = fs.readFileSync(templatePath, 'utf-8');
      this.logger.log(
        `Template de relatório mensal carregado: ${templatePath}`,
      );
    } catch (error) {
      this.logger.error(
        'Falha ao carregar template de relatório mensal. Usando fallback embutido.',
        error,
      );
      this.monthlyReportTemplate = this.buildFallbackMonthlyTemplate();
    }
  }

  async findAll(): Promise<Report[]> {
    const { companyId } = this.getTenantContextOrThrow();
    return this.reportRepository.find({
      where: { company_id: companyId },
      order: { created_at: 'DESC' },
      take: 100,
    });
  }

  async findPaginated(opts?: {
    page?: number;
    limit?: number;
  }): Promise<OffsetPage<Report>> {
    const { companyId } = this.getTenantContextOrThrow();
    const { page, limit, skip } = normalizeOffsetPagination(opts, {
      defaultLimit: 12,
      maxLimit: 50,
    });

    const [data, total] = await this.reportRepository.findAndCount({
      where: { company_id: companyId },
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });

    return toOffsetPage(data, total, page, limit);
  }

  async findOne(id: string): Promise<Report> {
    const { companyId } = this.getTenantContextOrThrow();
    const report = await this.reportRepository.findOne({
      where: { id, company_id: companyId },
    });
    if (!report) {
      throw new NotFoundException(`Relatório com ID ${id} não encontrado`);
    }
    return report;
  }

  async remove(id: string): Promise<void> {
    const report = await this.findOne(id);
    await this.reportRepository.remove(report);
  }

  async generateBuffer(reportType: string, params: unknown): Promise<Buffer> {
    switch (reportType) {
      case 'monthly': {
        const parsedParams =
          (params as Partial<{
            companyId: string;
            year: number;
            month: number;
          }>) || {};
        const { companyId, year, month } = parsedParams;
        if (!companyId || !year || !month) {
          throw new BadRequestException(
            'Parâmetros obrigatórios ausentes para relatório mensal (companyId, year, month)',
          );
        }
        return this.generateMonthlyReport(companyId, year, month);
      }
      default:
        throw new BadRequestException(
          `Tipo de relatório não suportado: ${reportType}`,
        );
    }
  }

  async generateMonthlyReport(
    companyId: string,
    year: number,
    month: number,
  ): Promise<Buffer> {
    const { siteId, siteScope, isSuperAdmin } = this.getTenantContextOrThrow();
    this.logger.log(
      `Iniciando geração de relatório mensal para empresa ${companyId} (Período: ${month}/${year})`,
    );

    const company = (await this.companiesService.findOne(companyId)) as {
      razao_social: string;
    };
    const reportData: {
      estatisticas: MonthlyReportStats;
      analise_gandra: string;
    } = await this.tenantService.run(
      { companyId, isSuperAdmin, siteId, siteScope },
      async () => this.buildMonthlyReportRecord(companyId, year, month),
    );

    const html = this.buildMonthlyReportHtml({
      companyName: company.razao_social,
      month,
      year,
      estatisticas: reportData.estatisticas,
      analise_gandra: reportData.analise_gandra,
    });

    return this.pdfService.generateFromHtml(html);
  }

  private async buildMonthlyReportRecord(
    companyId: string,
    year: number,
    month: number,
  ): Promise<Report> {
    const { siteId, siteScope, isSuperAdmin } = this.getTenantContextOrThrow();
    const scopedSiteId = !isSuperAdmin && siteScope !== 'all' ? siteId : undefined;
    const [
      aprsCount,
      ptsCount,
      ddsCount,
      checklistsCount,
      trainingsCount,
      expiredEpisCount,
    ] = await Promise.all([
      this.countByMonth(
        this.aprsRepository,
        'apr',
        'data_inicio',
        companyId,
        year,
        month,
        scopedSiteId,
      ),
      this.countByMonth(
        this.ptsRepository,
        'pt',
        'data_hora_inicio',
        companyId,
        year,
        month,
        scopedSiteId,
      ),
      this.countByMonth(
        this.ddsRepository,
        'dds',
        'data',
        companyId,
        year,
        month,
        scopedSiteId,
      ),
      this.countByMonth(
        this.checklistsRepository,
        'checklist',
        'data',
        companyId,
        year,
        month,
        scopedSiteId,
      ),
      this.countByMonth(
        this.trainingsRepository,
        'training',
        'data_conclusao',
        companyId,
        year,
        month,
        undefined,
      ),
      this.countByMonth(
        this.episRepository,
        'epi',
        'validade_ca',
        companyId,
        year,
        month,
        undefined,
      ),
    ]);

    const estatisticas: MonthlyReportStats = {
      aprs_count: aprsCount,
      pts_count: ptsCount,
      dds_count: ddsCount,
      checklists_count: checklistsCount,
      trainings_count: trainingsCount,
      epis_expired_count: expiredEpisCount,
    };

    const analise_gandra = this.buildMonthlyAnalysis(year, month, estatisticas);
    const titulo = `Relatório Mensal SGS - ${String(month).padStart(2, '0')}/${year}`;
    const descricao =
      'Relatório consolidado com indicadores mensais de APR, PT, DDS, checklists, treinamentos e vencimentos de EPI.';

    const existing = await this.reportRepository.findOne({
      where: { company_id: companyId, ano: year, mes: month },
    });

    if (existing) {
      existing.titulo = titulo;
      existing.descricao = descricao;
      existing.estatisticas = estatisticas;
      existing.analise_gandra = analise_gandra;
      return this.reportRepository.save(existing);
    }

    return this.reportRepository.save(
      this.reportRepository.create({
        titulo,
        descricao,
        mes: month,
        ano: year,
        company_id: companyId,
        estatisticas,
        analise_gandra,
      }),
    );
  }

  private async countByMonth<T extends { company_id: string }>(
    repository: Repository<T>,
    alias: string,
    dateColumn: MonthlyReportDateColumn,
    companyId: string,
    year: number,
    month: number,
    siteId?: string,
  ): Promise<number> {
    if (!MONTHLY_REPORT_DATE_COLUMNS.has(dateColumn)) {
      throw new Error(`Coluna de data não permitida: ${dateColumn}`);
    }

    const { monthStart, nextMonth } = this.resolveMonthRange(year, month);

    return repository
      .createQueryBuilder(alias)
      .where(`${alias}.company_id = :companyId`, { companyId })
      .andWhere(siteId ? `${alias}.site_id = :siteId` : '1=1', siteId ? { siteId } : {})
      .andWhere(`${alias}.${dateColumn} IS NOT NULL`)
      .andWhere(`${alias}.${dateColumn} >= :monthStart`, { monthStart })
      .andWhere(`${alias}.${dateColumn} < :nextMonth`, { nextMonth })
      .getCount();
  }

  private resolveMonthRange(year: number, month: number): MonthRange {
    if (!Number.isInteger(year) || !Number.isInteger(month)) {
      throw new BadRequestException(
        'Ano e mês do relatório mensal devem ser inteiros válidos.',
      );
    }

    if (month < 1 || month > 12) {
      throw new BadRequestException(
        'Mês do relatório mensal deve estar entre 1 e 12.',
      );
    }

    const monthStart = new Date(Date.UTC(year, month - 1, 1))
      .toISOString()
      .slice(0, 10);
    const nextMonth = new Date(Date.UTC(year, month, 1))
      .toISOString()
      .slice(0, 10);

    return { monthStart, nextMonth };
  }

  private buildMonthlyAnalysis(
    year: number,
    month: number,
    stats: MonthlyReportStats,
  ): string {
    const totalOperationalRecords =
      stats.aprs_count +
      stats.pts_count +
      stats.dds_count +
      stats.checklists_count;

    const highlights = [
      `${totalOperationalRecords} registros operacionais emitidos no período`,
      `${stats.trainings_count} treinamento(s) concluído(s)`,
    ];

    if (stats.epis_expired_count > 0) {
      highlights.push(
        `${stats.epis_expired_count} EPI(s) com CA vencido identificado(s) no mês`,
      );
    }

    return `No período ${String(month).padStart(2, '0')}/${year}, foram registrados ${highlights.join(', ')}. Priorize revisão das frentes com menor emissão preventiva e trate imediatamente qualquer vencimento de EPI para evitar bloqueios operacionais.`;
  }

  private buildMonthlyReportHtml(data: {
    companyName: string;
    month: number;
    year: number;
    estatisticas: MonthlyReportStats;
    analise_gandra: string;
  }): string {
    const { companyName, month, year, estatisticas, analise_gandra } = data;
    const expiredEpis = Number(estatisticas.epis_expired_count ?? 0);
    const trainingsCount = Number(estatisticas.trainings_count ?? 0);
    const operationalTotal =
      Number(estatisticas.aprs_count ?? 0) +
      Number(estatisticas.pts_count ?? 0) +
      Number(estatisticas.dds_count ?? 0) +
      Number(estatisticas.checklists_count ?? 0);
    const statusSignal =
      expiredEpis > 0
        ? 'Atenção'
        : operationalTotal >= 25
          ? 'Ativa'
          : 'Estável';
    const statusTone =
      expiredEpis > 0 ? 'danger' : operationalTotal >= 25 ? 'success' : 'info';
    const trainingTone = trainingsCount > 0 ? 'success' : 'warning';
    const governanceNote = `Documento emitido para ${companyName} com fechamento mensal de ${String(month).padStart(2, '0')}/${year}, preservando rastreabilidade executiva dos indicadores de SST.`;
    const replaceToken = (source: string, token: string, value: string) =>
      source.split(`{{${token}}}`).join(value);

    const metricLabels: Record<string, { label: string; style: string }> = {
      aprs_count: { label: 'APRs Emitidas', style: 'primary' },
      pts_count: { label: 'PTs Emitidas', style: 'primary' },
      dds_count: { label: 'DDS Realizados', style: 'success' },
      checklists_count: { label: 'Checklists Aplicados', style: 'primary' },
      trainings_count: { label: 'Treinamentos Concluídos', style: 'success' },
      epis_expired_count: { label: 'EPIs com CA Vencido', style: 'danger' },
    };

    const statsCardsHtml = Object.entries(estatisticas)
      .map(([key, value]) => {
        const metric = metricLabels[key];
        if (!metric) return '';
        const cardStyle =
          metric.style === 'danger' && value === 0 ? 'success' : metric.style;
        const finalValue = value ?? 0;

        return `
          <div class="stat-card ${cardStyle}">
            <span class="stat-value">${String(finalValue)}</span>
            <span class="stat-label">${metric.label}</span>
          </div>
        `;
      })
      .join('');

    let html = this.monthlyReportTemplate;
    html = replaceToken(html, 'companyName', companyName);
    html = replaceToken(
      html,
      'periodo',
      `${String(month).padStart(2, '0')}/${year}`,
    );
    html = replaceToken(
      html,
      'dataEmissao',
      new Date().toLocaleString('pt-BR'),
    );
    html = replaceToken(
      html,
      'documentTitle',
      'Fechamento mensal de conformidade',
    );
    html = replaceToken(html, 'operational_total', String(operationalTotal));
    html = replaceToken(html, 'trainings_count', String(trainingsCount));
    html = replaceToken(html, 'status_signal', statusSignal);
    html = replaceToken(html, 'status_tone', statusTone);
    html = replaceToken(html, 'training_tone', trainingTone);
    html = replaceToken(html, 'governance_note', governanceNote);
    html = replaceToken(html, 'stats_cards', statsCardsHtml);
    html = replaceToken(html, 'analise_gandra', analise_gandra);

    return html;
  }
}
