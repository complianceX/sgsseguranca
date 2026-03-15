import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
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
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color: #0f172a; margin: 0; padding: 0; background: #fff; }
    .page { width: 210mm; height: 297mm; padding: 14mm; position: relative; display: flex; flex-direction: column; }
    .header { margin: -14mm -14mm 0; padding: 14mm 14mm 10mm; background: #102033; color: #fff; border-bottom: 2.6mm solid #1f4e79; position: relative; min-height: 36mm; }
    .title { font-size: 16pt; font-weight: 700; margin: 0; }
    .subtitle { color: #dbe5ee; font-size: 9.5pt; margin: 4px 0 0; }
    .document-chip { position: absolute; top: 10mm; right: 14mm; width: 52mm; background: #fff; color: #0f172a; border-radius: 6px; padding: 8px 10px; }
    .document-chip .k { font-size: 7pt; text-transform: uppercase; letter-spacing: .08em; color: #64748b; font-weight: 700; }
    .document-chip .v { margin-top: 6px; font-size: 11pt; font-weight: 700; }
    .document-chip .m { margin-top: 4px; font-size: 7.5pt; color: #475569; }
    .body { flex-grow: 1; padding-top: 8mm; }
    .meta-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 12px; }
    .meta { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 12px; }
    .meta .k { color: #64748b; font-size: 7.3pt; text-transform: uppercase; letter-spacing: .08em; font-weight: 700; margin-bottom: 5px; display: block; }
    .meta .v { font-weight: 700; font-size: 10pt; color: #0f172a; display: block; line-height: 1.35; }
    .strip { display: grid; grid-template-columns: 1.3fr repeat(3, minmax(0, 1fr)); gap: 10px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; margin-bottom: 12px; overflow: hidden; }
    .strip-summary { border-left: 4px solid #0f766e; padding: 12px 14px; }
    .strip-summary .t { font-size: 10.5pt; font-weight: 700; color: #0f172a; margin-bottom: 4px; }
    .strip-summary .b { font-size: 8.6pt; line-height: 1.45; color: #334155; }
    .pill { background: #fff; border-left: 4px solid #1f4e79; padding: 10px 12px; display: flex; flex-direction: column; justify-content: center; }
    .pill.success { border-left-color: #166534; }
    .pill.warning { border-left-color: #b45309; }
    .pill.danger { border-left-color: #b91c1c; }
    .pill .k { font-size: 7pt; text-transform: uppercase; letter-spacing: .08em; font-weight: 700; color: #64748b; margin-bottom: 5px; }
    .pill .v { font-size: 13pt; font-weight: 700; color: #0f172a; }
    h2 { margin: 14px 0 8px; font-size: 11pt; color: #0f172a; }
    .stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-bottom: 12px; }
    .stat-card { background: #f8fafc; border: 1px solid #cbd5e1; border-left: 4px solid #1f4e79; border-radius: 6px; padding: 12px 14px; min-height: 72px; }
    .stat-card.primary { border-left-color: #1f4e79; }
    .stat-card.success { border-left-color: #166534; }
    .stat-card.warning { border-left-color: #b45309; }
    .stat-card.danger { border-left-color: #b91c1c; }
    .stat-card .value { font-size: 19pt; font-weight: 700; color: #102033; margin-bottom: 4px; }
    .stat-card .label { font-size: 8.3pt; color: #475569; font-weight: 600; line-height: 1.35; }
    .analysis { margin-top: 0; border: 1px solid #cbd5e1; border-radius: 6px; background: #f8fafc; padding: 14px; min-height: 60mm; }
    .analysis .t { font-size: 10.5pt; font-weight: 700; margin-bottom: 8px; color: #0f172a; }
    .analysis pre { white-space: pre-wrap; font-family: inherit; margin: 0; line-height: 1.65; font-size: 9.6pt; }
    .governance { margin-top: 12px; background: #eef2f7; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 12px; }
    .governance .k { font-size: 7.2pt; text-transform: uppercase; letter-spacing: .08em; font-weight: 700; color: #64748b; margin-bottom: 4px; }
    .governance .v { font-size: 8.5pt; color: #334155; line-height: 1.45; }
    .footer { position: absolute; left: 14mm; right: 14mm; bottom: 8mm; display: flex; justify-content: space-between; border-top: 1px solid #cbd5e1; padding-top: 4mm; font-size: 8pt; color: #64748b; }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <h1 class="title">Relatório &lt;GST&gt; - {{periodo}}</h1>
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
      <span>Sistema &lt;GST&gt; Gestão de Segurança do Trabalho</span>
      <span>Documento confidencial | Página 1 de 1</span>
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
    const tenantId = this.tenantService.getTenantId();
    return this.reportRepository.find({
      where: tenantId ? { company_id: tenantId } : {},
      order: { created_at: 'DESC' },
    });
  }

  async findPaginated(opts?: {
    page?: number;
    limit?: number;
  }): Promise<OffsetPage<Report>> {
    const tenantId = this.tenantService.getTenantId();
    const { page, limit, skip } = normalizeOffsetPagination(opts, {
      defaultLimit: 12,
      maxLimit: 50,
    });

    const [data, total] = await this.reportRepository.findAndCount({
      where: tenantId ? { company_id: tenantId } : {},
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });

    return toOffsetPage(data, total, page, limit);
  }

  async findOne(id: string): Promise<Report> {
    const tenantId = this.tenantService.getTenantId();
    const report = await this.reportRepository.findOne({
      where: tenantId ? { id, company_id: tenantId } : { id },
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
          throw new Error(
            'Parâmetros obrigatórios ausentes para relatório mensal (companyId, year, month)',
          );
        }
        return this.generateMonthlyReport(companyId, year, month);
      }
      default:
        throw new Error(`Tipo de relatório não suportado: ${reportType}`);
    }
  }

  async generateMonthlyReport(
    companyId: string,
    year: number,
    month: number,
  ): Promise<Buffer> {
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
      { companyId, isSuperAdmin: false },
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
      ),
      this.countByMonth(
        this.ptsRepository,
        'pt',
        'data_hora_inicio',
        companyId,
        year,
        month,
      ),
      this.countByMonth(
        this.ddsRepository,
        'dds',
        'data',
        companyId,
        year,
        month,
      ),
      this.countByMonth(
        this.checklistsRepository,
        'checklist',
        'data',
        companyId,
        year,
        month,
      ),
      this.countByMonth(
        this.trainingsRepository,
        'training',
        'data_conclusao',
        companyId,
        year,
        month,
      ),
      this.countByMonth(
        this.episRepository,
        'epi',
        'validade_ca',
        companyId,
        year,
        month,
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
    const titulo = `Relatório Mensal <GST> Gestão de Segurança do Trabalho - ${String(month).padStart(2, '0')}/${year}`;
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
    dateColumn: string,
    companyId: string,
    year: number,
    month: number,
  ): Promise<number> {
    return repository
      .createQueryBuilder(alias)
      .where(`${alias}.company_id = :companyId`, { companyId })
      .andWhere(`${alias}.${dateColumn} IS NOT NULL`)
      .andWhere(`EXTRACT(YEAR FROM ${alias}.${dateColumn}) = :year`, { year })
      .andWhere(`EXTRACT(MONTH FROM ${alias}.${dateColumn}) = :month`, {
        month,
      })
      .getCount();
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
    const statusTone = expiredEpis > 0 ? 'danger' : 'success';
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
      new Date().toLocaleDateString('pt-BR'),
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
