import type { Job } from 'bullmq';
import { PdfProcessor } from './pdf.processor';

describe('PdfProcessor tenant isolation', () => {
  it('processa job de PDF dentro de contexto explícito de tenant', async () => {
    const reportsService = {
      generateBuffer: jest.fn().mockResolvedValue({
        buffer: Buffer.from('pdf'),
        report: {
          id: 'report-1',
          company_id: 'company-1',
          created_at: new Date('2026-05-05T10:00:00.000Z'),
          titulo: 'Relatório Mensal',
          pdf_file_key: null,
        },
        documentCode: 'RPT-2026-05-REPORT001',
        originalName: 'RELATORIO_MENSAL_05-2026.pdf',
        title: 'Relatório Mensal',
      }),
    };
    const documentStorageService = {
      generateDocumentKey: jest
        .fn()
        .mockReturnValue(
          'documents/company-1/reports/report-1/1710000000000-RELATORIO_MENSAL_05-2026.pdf',
        ),
      uploadFile: jest.fn().mockResolvedValue(undefined),
      getSignedUrl: jest
        .fn()
        .mockResolvedValue('https://cdn.example.com/report.pdf'),
      deleteFile: jest.fn().mockResolvedValue(undefined),
    };
    const documentGovernanceService = {
      registerFinalDocument: jest.fn().mockResolvedValue({
        registryEntry: { document_code: 'RPT-2026-05-REPORT001' },
      }),
    };
    const metricsService = {
      recordQueueJob: jest.fn(),
      recordPdfError: jest.fn(),
      recordPdfGeneration: jest.fn(),
    };
    const tenantQuota = {
      tryAcquire: jest.fn().mockResolvedValue({ acquired: true }),
      getDelayMs: jest.fn().mockReturnValue(1000),
      release: jest.fn().mockResolvedValue(undefined),
    };
    const tenantService = {
      run: jest.fn(async (_ctx, fn: () => Promise<unknown>) => fn()),
    };
    const dlqQueue = {
      add: jest.fn().mockResolvedValue(undefined),
    };

    const processor = new PdfProcessor(
      reportsService as never,
      documentStorageService as never,
      documentGovernanceService as never,
      metricsService as never,
      tenantQuota as never,
      tenantService as never,
      dlqQueue as never,
    );

    const result = await processor.process({
      id: 'job-1',
      name: 'generate',
      data: {
        reportType: 'monthly',
        params: { companyId: 'company-1', year: 2026, month: 3 },
        userId: 'user-1',
        companyId: 'company-1',
      },
      opts: { attempts: 1 },
    } as Job<unknown, unknown, string>);

    expect(tenantService.run).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'company-1', isSuperAdmin: false }),
      expect.any(Function),
    );
    expect(documentStorageService.uploadFile).toHaveBeenCalledWith(
      'documents/company-1/reports/report-1/1710000000000-RELATORIO_MENSAL_05-2026.pdf',
      Buffer.from('pdf'),
      'application/pdf',
    );
    expect(result).toEqual({ url: 'https://cdn.example.com/report.pdf' });
  });
});
