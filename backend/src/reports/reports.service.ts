import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Report } from './entities/report.entity';
import { PdfService } from '../common/services/pdf.service';
import { TenantService } from '../common/tenant/tenant.service';
import { CompaniesService } from '../companies/companies.service';
import { EpisService } from '../epis/epis.service';
import { TrainingsService } from '../trainings/trainings.service';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    private readonly pdfService: PdfService,
    private readonly tenantService: TenantService,
    private readonly companiesService: CompaniesService,
    private readonly episService: EpisService,
    private readonly trainingsService: TrainingsService,
  ) {}

  async findAll(): Promise<Report[]> {
    const tenantId = this.tenantService.getTenantId();
    return this.reportRepository.find({
      where: tenantId ? { company_id: tenantId } : {},
      order: { created_at: 'DESC' },
    });
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
      async () => {
        const epis = await this.episService.findAll();
        const trainings = await this.trainingsService.findAll();

        const stats = {
          'EPIs com CA vencido no mês': epis.filter(
            (e) =>
              e.validade_ca &&
              new Date(e.validade_ca).getFullYear() === year &&
              new Date(e.validade_ca).getMonth() + 1 === month,
          ).length,
          'Treinamentos realizados no mês': trainings.filter(
            (t) =>
              t.data_conclusao &&
              new Date(t.data_conclusao).getFullYear() === year &&
              new Date(t.data_conclusao).getMonth() + 1 === month,
          ).length,
        };

        return {
          estatisticas: stats,
          analise_gandra:
            'Esta é uma análise automática preliminar. Recomenda-se uma revisão detalhada dos dados para ações corretivas.',
        } as { estatisticas: Record<string, any>; analise_gandra: string };
      },
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

  private buildMonthlyReportHtml(data: {
    companyName: string;
    month: number;
    year: number;
    estatisticas: Record<string, any>;
    analise_gandra: string;
  }): string {
    const { companyName, month, year, estatisticas, analise_gandra } = data;

    const statsHtml = `
      <h3>Estatísticas do Mês</h3>
      <table>
        <thead><tr><th>Métrica</th><th>Valor</th></tr></thead>
        <tbody>
          ${Object.entries(estatisticas)
            .map(
              ([key, value]) =>
                `<tr><td>${key}</td><td>${String(value)}</td></tr>`,
            )
            .join('')}
        </tbody>
      </table>`;

    return `
      <html>
        <head>
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; font-size: 12px; }
            h1 { font-size: 24px; color: #111; text-align: center; }
            h2 { font-size: 18px; border-bottom: 1px solid #eee; padding-bottom: 5px; margin-top: 30px; }
            h3 { font-size: 14px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; font-weight: bold; }
          </style>
        </head>
        <body>
          <h1>Relatório Mensal de Conformidade</h1>
          <h2>${companyName}</h2>
          <p><strong>Período de Referência:</strong> ${String(month).padStart(2, '0')}/${year}</p>
          <p><strong>Data de Emissão:</strong> ${new Date().toLocaleDateString('pt-BR')}</p>
          ${statsHtml}
          <h2>Análise e Recomendações</h2>
          <p>${analise_gandra}</p>
        </body>
      </html>
    `;
  }
}
