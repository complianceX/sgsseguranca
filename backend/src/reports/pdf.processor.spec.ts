import type { Job } from 'bullmq';
import { PdfProcessor } from './pdf.processor';

describe('PdfProcessor tenant isolation', () => {
  it('processa job de PDF dentro de contexto explícito de tenant', async () => {
    const reportsService = {
      generateBuffer: jest.fn().mockResolvedValue(Buffer.from('pdf')),
    };
    const storageService = {
      uploadPdf: jest
        .fn()
        .mockResolvedValue('https://cdn.example.com/report.pdf'),
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
      storageService as never,
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
    expect(result).toEqual({ url: 'https://cdn.example.com/report.pdf' });
  });
});
