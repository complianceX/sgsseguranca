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

  private loadTemplates() {
    try {
      const templatePath = path.join(
        __dirname,
        'templates',
        'monthly-report.template.html',
      );
      this.monthlyReportTemplate = fs.readFileSync(templatePath, 'utf-8');
      this.logger.log('Template de relatório mensal carregado com sucesso.');
    } catch (error) {
      this.logger.error('Falha ao carregar template de relatório mensal.', error);
      throw new Error('Não foi possível carregar o template do relatório.');
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
        const { companyId, year, month } = (params as any) || {};
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

    const company = await this.companiesService.findOne(companyId);
    const reportData = await this.tenantService.run(
      { companyId, isSuperAdmin: false },
      async () => this.buildMonthlyReportRecord(companyId, year, month),
    );

    const html = await this.buildMonthlyReportHtml({
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
      this.countByMonth(this.aprsRepository, 'apr', 'data_inicio', companyId, year, month),
      this.countByMonth(this.ptsRepository, 'pt', 'data_hora_inicio', companyId, year, month),
      this.countByMonth(this.ddsRepository, 'dds', 'data', companyId, year, month),
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

    const estatisticas = {
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
      .andWhere(`EXTRACT(MONTH FROM ${alias}.${dateColumn}) = :month`, { month })
      .getCount();
  }

  private buildMonthlyAnalysis(
    year: number,
    month: number,
    stats: {
      aprs_count: number;
      pts_count: number;
      dds_count: number;
      checklists_count: number;
      trainings_count: number;
      epis_expired_count: number;
    },
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

  private async buildMonthlyReportHtml(data: {
    companyName: string;
    month: number;
    year: number;
    estatisticas: Record<string, any>;
    analise_gandra: string;
  }): Promise<string> {
    const { companyName, month, year, estatisticas, analise_gandra } = data;

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
    html = html.replace('{{companyName}}', companyName);
    html = html.replace('{{periodo}}', `${String(month).padStart(2, '0')}/${year}`);
    html = html.replace('{{dataEmissao}}', new Date().toLocaleDateString('pt-BR'));
    html = html.replace('{{stats_cards}}', statsCardsHtml);
    html = html.replace('{{analise_gandra}}', analise_gandra);

    return html;
  }
}
