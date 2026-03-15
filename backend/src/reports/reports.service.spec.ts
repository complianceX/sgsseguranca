import { ReportsService } from './reports.service';

describe('ReportsService monthly report rendering', () => {
  let service: ReportsService;
  type ReportsServiceArgs = ConstructorParameters<typeof ReportsService>;

  beforeEach(() => {
    service = new ReportsService(
      {} as ReportsServiceArgs[0],
      {} as ReportsServiceArgs[1],
      {} as ReportsServiceArgs[2],
      {} as ReportsServiceArgs[3],
      {} as ReportsServiceArgs[4],
      {} as ReportsServiceArgs[5],
      {} as ReportsServiceArgs[6],
      {} as ReportsServiceArgs[7],
      { getTenantId: jest.fn() } as ReportsServiceArgs[8],
      { findOne: jest.fn() } as ReportsServiceArgs[9],
    );
  });

  it('renders explicit company metadata and preserves long analysis text', () => {
    const longAnalysis = new Array(120)
      .fill(
        'A analise mensal manteve foco em governanca, documentacao e capacitacao.',
      )
      .join(' ');

    const html = (
      service as unknown as {
        buildMonthlyReportHtml: (data: {
          companyName: string;
          month: number;
          year: number;
          estatisticas: Record<string, number>;
          analise_gandra: string;
        }) => string;
      }
    ).buildMonthlyReportHtml({
      companyName: 'Empresa Teste LTDA',
      month: 3,
      year: 2026,
      estatisticas: {
        aprs_count: 4,
        pts_count: 3,
        dds_count: 5,
        checklists_count: 8,
        trainings_count: 2,
        epis_expired_count: 0,
      },
      analise_gandra: longAnalysis,
    });

    expect(html).toContain('Empresa');
    expect(html).toContain('Empresa Teste LTDA');
    expect(html).toContain('Fechamento mensal de conformidade');
    expect(html).toContain(longAnalysis);
    expect(html).toContain('overflow-wrap: anywhere');
    expect(html).toContain('Documento confidencial | Emissão digital');
    expect(html).not.toContain('Página 1 de 1');
  });
});
