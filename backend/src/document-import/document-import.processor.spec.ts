import type { Job } from 'bullmq';
import { DocumentImportStatus } from './entities/document-import-status.enum';
import { DocumentImportProcessor } from './document-import.processor';

describe('DocumentImportProcessor', () => {
  let processor: DocumentImportProcessor;
  let documentImportService: {
    processQueuedDocument: jest.Mock;
    markAsDeadLetter: jest.Mock;
  };
  let metricsService: {
    recordQueueJob: jest.Mock;
  };
  let dlqQueue: {
    add: jest.Mock;
  };
  let tenantService: {
    run: jest.Mock;
  };

  beforeEach(() => {
    documentImportService = {
      processQueuedDocument: jest.fn(),
      markAsDeadLetter: jest.fn().mockResolvedValue(undefined),
    };
    metricsService = {
      recordQueueJob: jest.fn(),
    };
    dlqQueue = {
      add: jest.fn().mockResolvedValue(undefined),
    };
    tenantService = {
      run: jest.fn(async (_ctx, fn: () => Promise<unknown>) => fn()),
    };

    processor = new DocumentImportProcessor(
      documentImportService as never,
      metricsService as never,
      tenantService as never,
      dlqQueue as never,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('processa o job assíncrono e registra métricas de sucesso', async () => {
    documentImportService.processQueuedDocument.mockResolvedValue({
      documentId: 'doc-1',
      status: DocumentImportStatus.COMPLETED,
    });

    const result = await processor.process({
      id: 'job-1',
      name: 'process-document-import',
      attemptsMade: 0,
      data: {
        documentId: 'doc-1',
        companyId: 'company-1',
      },
    } as Job<unknown, unknown, string>);

    expect(documentImportService.processQueuedDocument).toHaveBeenCalledWith(
      'doc-1',
    );
    expect(tenantService.run).toHaveBeenCalledWith(
      { companyId: 'company-1', isSuperAdmin: false },
      expect.any(Function),
    );
    expect(metricsService.recordQueueJob).toHaveBeenCalledWith(
      'document-import',
      'process-document-import',
      expect.any(Number),
      'success',
      'company-1',
    );
    expect(result).toEqual({
      documentId: 'doc-1',
      status: DocumentImportStatus.COMPLETED,
    });
  });

  it('direciona falha final para DEAD_LETTER e publica no DLQ', async () => {
    documentImportService.processQueuedDocument.mockRejectedValue(
      new Error('parse timeout'),
    );

    await expect(
      processor.process({
        id: 'job-1',
        name: 'process-document-import',
        attemptsMade: 2,
        opts: { attempts: 3 },
        data: {
          documentId: 'doc-1',
          companyId: 'company-1',
        },
      } as Job<unknown, unknown, string>),
    ).rejects.toThrow('parse timeout');

    expect(documentImportService.markAsDeadLetter).toHaveBeenCalledWith(
      'doc-1',
      'company-1',
      'parse timeout',
    );
    const [name, payload, options] = dlqQueue.add.mock.calls[0] as [
      string,
      {
        originalQueue: string;
        documentId?: string;
        companyId?: string;
        attemptsMade: number;
        error: { message: string };
      },
      {
        attempts: number;
        removeOnComplete: boolean;
        removeOnFail: boolean;
      },
    ];

    expect(name).toBe('dead-letter');
    expect(payload.originalQueue).toBe('document-import');
    expect(payload.documentId).toBe('doc-1');
    expect(payload.companyId).toBe('company-1');
    expect(payload.attemptsMade).toBe(3);
    expect(payload.error.message).toBe('parse timeout');
    expect(options).toMatchObject({
      attempts: 1,
      removeOnComplete: false,
      removeOnFail: false,
    });
  });

  it('não envia para DLQ enquanto ainda houver retry disponível', async () => {
    documentImportService.processQueuedDocument.mockRejectedValue(
      new Error('temporary failure'),
    );

    await expect(
      processor.process({
        id: 'job-1',
        name: 'process-document-import',
        attemptsMade: 0,
        opts: { attempts: 3 },
        data: {
          documentId: 'doc-1',
          companyId: 'company-1',
        },
      } as Job<unknown, unknown, string>),
    ).rejects.toThrow('temporary failure');

    expect(documentImportService.markAsDeadLetter).not.toHaveBeenCalled();
    expect(dlqQueue.add).not.toHaveBeenCalled();
  });
});
