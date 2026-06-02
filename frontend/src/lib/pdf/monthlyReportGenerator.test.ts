import {
  buildMonthlyReportMetadata,
  generateMonthlyReportPdf,
  paginateMonthlyReportLines,
  type MonthlyReportPdfSource,
} from './monthlyReportGenerator';

const baseReport: MonthlyReportPdfSource = {
  id: 'report-123',
  titulo: 'Fechamento mensal de conformidade',
  mes: 3,
  ano: 2026,
  companyName: 'Empresa Teste LTDA',
  estatisticas: {
    aprs_count: 4,
    pts_count: 2,
    dds_count: 6,
    checklists_count: 8,
    trainings_count: 3,
    epis_expired_count: 0,
  },
  analise_gandra: 'Analise curta.',
  created_at: '2026-03-14T12:30:00.000Z',
};

describe('monthlyReportGenerator', () => {
  it('includes explicit company metadata', () => {
    const metadata = buildMonthlyReportMetadata(baseReport, '14/03/2026 às 09:30');

    expect(metadata).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Empresa',
          value: 'Empresa Teste LTDA',
        }),
      ]),
    );
  });

  it('paginates long analysis lines without dropping content', () => {
    const lines = Array.from({ length: 120 }, (_, index) => `Linha ${index + 1}`);
    const pages = paginateMonthlyReportLines(lines, 20, 30);

    expect(pages).toHaveLength(5);
    expect(pages.flat()).toEqual(lines);
  });

  it('generates a pdf for long analysis content without throwing', () => {
    const longReport: MonthlyReportPdfSource = {
      ...baseReport,
      analise_gandra: new Array(220)
        .fill('A analise mensal consolidou registros, treinamentos e foco corretivo.')
        .join(' '),
    };

    const result = generateMonthlyReportPdf(longReport, {
      save: false,
      output: 'base64',
    });

    expect(result).toEqual(
      expect.objectContaining({
        filename: expect.stringContaining('Relatorio_SGS_Gestao_Seguranca_Trabalho'),
        base64: expect.any(String),
      }),
    );
    expect(result?.base64.length).toBeGreaterThan(100);
  });
});
