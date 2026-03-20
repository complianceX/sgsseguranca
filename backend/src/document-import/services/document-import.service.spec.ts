import { DocumentImportStatus } from '../entities/document-import-status.enum';
import { DocumentImportService } from './document-import.service';
import { DocumentImport } from '../entities/document-import.entity';

const COMPANY_ID = 'company-1';
const DOCUMENT_ID = '11111111-1111-4111-8111-111111111111';

function makeDocumentImport(
  overrides: Partial<DocumentImport> = {},
): DocumentImport {
  return {
    id: DOCUMENT_ID,
    empresaId: COMPANY_ID,
    tipoDocumento: 'APR',
    nomeArquivo: 'document.pdf',
    hash: 'hash-1',
    idempotencyKey: null,
    tamanho: 128,
    mimeType: 'application/pdf',
    textoExtraido: null,
    arquivoStaging: Buffer.from('%PDF-1.4'),
    jsonEstruturado: null,
    metadata: {
      queue: {
        attempts: 3,
        timeoutMs: 180000,
        statusUrl: `/documents/import/${DOCUMENT_ID}/status`,
      },
    },
    status: DocumentImportStatus.UPLOADED,
    scoreConfianca: 0,
    dataDocumento: null,
    processingJobId: null,
    processingAttempts: 0,
    lastAttemptAt: null,
    deadLetteredAt: null,
    createdAt: new Date('2026-03-20T10:00:00.000Z'),
    updatedAt: new Date('2026-03-20T10:00:00.000Z'),
    mensagemErro: null,
    ...overrides,
  } as DocumentImport;
}

describe('DocumentImportService', () => {
  let service: DocumentImportService;
  let repository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let queryBuilder: {
    where: jest.Mock;
    andWhere: jest.Mock;
    addSelect: jest.Mock;
    getOne: jest.Mock;
  };
  let fileParserService: {
    generateFileHash: jest.Mock;
    extractText: jest.Mock;
  };
  let documentClassifierService: {
    getDocumentTypeDescription: jest.Mock;
    classifyDocument: jest.Mock;
  };
  let documentInterpreterService: {
    interpretDocument: jest.Mock;
  };
  let documentValidationService: {
    validateDocument: jest.Mock;
  };
  let ddsService: {
    create: jest.Mock;
  };
  let tenantService: {
    getTenantId: jest.Mock;
    isSuperAdmin: jest.Mock;
  };
  let queue: {
    add: jest.Mock;
    getJob: jest.Mock;
  };

  beforeEach(() => {
    queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
    };

    repository = {
      findOne: jest.fn(),
      create: jest.fn((input: Partial<DocumentImport>) =>
        makeDocumentImport(input),
      ),
      save: jest.fn((input) => Promise.resolve(input)),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    fileParserService = {
      generateFileHash: jest.fn().mockReturnValue('hash-1'),
      extractText: jest.fn().mockResolvedValue('conteudo extraido'),
    };
    documentClassifierService = {
      getDocumentTypeDescription: jest.fn().mockReturnValue('APR'),
      classifyDocument: jest.fn().mockResolvedValue({
        tipoDocumento: 'DDS',
        score: 0.91,
      }),
    };
    documentInterpreterService = {
      interpretDocument: jest.fn().mockResolvedValue({
        tipoDocumento: 'DDS',
        tema: 'DDS Importado',
        conteudo: 'Conteudo importado',
        resumo: 'Resumo',
        data: '2026-03-20T10:00:00.000Z',
        scoreConfianca: 0.88,
      }),
    };
    documentValidationService = {
      validateDocument: jest.fn().mockReturnValue({
        status: 'VALIDO',
        pendencias: [],
        scoreConfianca: 88,
      }),
    };
    ddsService = {
      create: jest.fn(),
    };
    tenantService = {
      getTenantId: jest.fn(() => COMPANY_ID),
      isSuperAdmin: jest.fn(() => false),
    };
    queue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
      getJob: jest.fn(),
    };

    service = new DocumentImportService(
      repository as never,
      fileParserService as never,
      documentClassifierService as never,
      documentInterpreterService as never,
      documentValidationService as never,
      ddsService as never,
      tenantService as never,
      queue as never,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('enfileira o documento e devolve contrato consultável de status', async () => {
    repository.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    repository.save.mockResolvedValue(
      makeDocumentImport({
        id: DOCUMENT_ID,
        status: DocumentImportStatus.UPLOADED,
      }),
    );

    const result = await service.enqueueDocumentProcessing(
      Buffer.from('%PDF-1.4 async'),
      COMPANY_ID,
      'APR',
      'application/pdf',
      'apr.pdf',
      'user-1',
      'idem-1',
    );

    const [jobName, jobData, jobOptions] = queue.add.mock.calls[0] as [
      string,
      {
        documentId: string;
        companyId: string;
        requestedByUserId?: string;
      },
      {
        attempts?: number;
        timeout?: number;
      },
    ];

    expect(jobName).toBe('process-document-import');
    expect(jobData).toEqual({
      documentId: DOCUMENT_ID,
      companyId: COMPANY_ID,
      requestedByUserId: 'user-1',
    });
    expect(jobOptions.attempts).toEqual(expect.any(Number));
    expect(jobOptions.timeout).toEqual(expect.any(Number));
    expect(jobOptions.jobId).toBe(`document-import:${DOCUMENT_ID}`);
    expect(repository.update).toHaveBeenCalledWith(
      { id: DOCUMENT_ID, empresaId: COMPANY_ID },
      expect.objectContaining({
        status: DocumentImportStatus.QUEUED,
        processingJobId: `document-import:${DOCUMENT_ID}`,
      }),
    );
    expect(result).toMatchObject({
      success: true,
      queued: true,
      documentId: DOCUMENT_ID,
      status: DocumentImportStatus.QUEUED,
      statusUrl: `/documents/import/${DOCUMENT_ID}/status`,
      reused: false,
      replayState: 'new',
      idempotencyKey: 'idem-1',
      job: {
        jobId: 'job-1',
        queueState: 'waiting',
        deadLettered: false,
      },
    });
  });

  it('não marca a importação como falha quando o job já foi enfileirado e a persistência pós-enqueue falha', async () => {
    repository.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    repository.save.mockResolvedValue(
      makeDocumentImport({
        id: DOCUMENT_ID,
        status: DocumentImportStatus.UPLOADED,
      }),
    );
    repository.update
      .mockResolvedValueOnce({ affected: 1 })
      .mockRejectedValueOnce(new Error('metadata persist failed'));

    const result = await service.enqueueDocumentProcessing(
      Buffer.from('%PDF-1.4 async'),
      COMPANY_ID,
      'APR',
      'application/pdf',
      'apr.pdf',
      'user-1',
      'idem-1',
    );

    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(repository.delete).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      documentId: DOCUMENT_ID,
      status: DocumentImportStatus.QUEUED,
      queued: true,
      reused: false,
      job: {
        jobId: 'job-1',
      },
    });
  });

  it('retorna status consultável com snapshot real do job', async () => {
    queryBuilder.getOne.mockResolvedValue(
      makeDocumentImport({
        id: DOCUMENT_ID,
        status: DocumentImportStatus.QUEUED,
        processingJobId: 'job-1',
        processingAttempts: 1,
      }),
    );
    queue.getJob.mockResolvedValue({
      id: 'job-1',
      attemptsMade: 1,
      opts: { attempts: 3 },
      getState: jest.fn().mockResolvedValue('active'),
    });

    const result = await service.getDocumentStatusResponse(DOCUMENT_ID);

    expect(result).toMatchObject({
      success: true,
      documentId: DOCUMENT_ID,
      status: DocumentImportStatus.QUEUED,
      completed: false,
      failed: false,
      statusUrl: `/documents/import/${DOCUMENT_ID}/status`,
      job: {
        jobId: 'job-1',
        queueState: 'active',
        attemptsMade: 1,
        maxAttempts: 3,
      },
    });
  });

  it('reutiliza a operação em andamento quando a mesma idempotency key é reenviada', async () => {
    repository.findOne.mockResolvedValueOnce(
      makeDocumentImport({
        idempotencyKey: 'idem-1',
        hash: 'hash-1',
        status: DocumentImportStatus.PROCESSING,
        processingJobId: 'job-1',
        processingAttempts: 1,
      }),
    );
    queue.getJob.mockResolvedValue({
      id: 'job-1',
      attemptsMade: 1,
      opts: { attempts: 3 },
      getState: jest.fn().mockResolvedValue('active'),
    });

    const result = await service.enqueueDocumentProcessing(
      Buffer.from('%PDF-1.4 async'),
      COMPANY_ID,
      'APR',
      'application/pdf',
      'apr.pdf',
      'user-1',
      'idem-1',
    );

    expect(queue.add).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      documentId: DOCUMENT_ID,
      status: DocumentImportStatus.PROCESSING,
      reused: true,
      replayState: 'in_progress',
      dedupeSource: 'idempotency_key',
      idempotencyKey: 'idem-1',
    });
  });

  it('bloqueia reuse da mesma idempotency key para outro arquivo', async () => {
    repository.findOne.mockResolvedValueOnce(
      makeDocumentImport({
        idempotencyKey: 'idem-1',
        hash: 'hash-existente',
      }),
    );

    await expect(
      service.enqueueDocumentProcessing(
        Buffer.from('%PDF-diferente'),
        COMPANY_ID,
        'APR',
        'application/pdf',
        'apr.pdf',
        'user-1',
        'idem-1',
      ),
    ).rejects.toThrow(
      'A mesma Idempotency-Key já foi utilizada para outro arquivo.',
    );

    expect(queue.add).not.toHaveBeenCalled();
  });

  it('devolve a mesma operação falhada quando a mesma idempotency key é repetida', async () => {
    repository.findOne.mockResolvedValueOnce(
      makeDocumentImport({
        idempotencyKey: 'idem-1',
        status: DocumentImportStatus.DEAD_LETTER,
        processingJobId: 'job-1',
        processingAttempts: 3,
        mensagemErro: 'parse timeout',
      }),
    );
    queue.getJob.mockResolvedValue(null);

    const result = await service.enqueueDocumentProcessing(
      Buffer.from('%PDF-1.4 async'),
      COMPANY_ID,
      'APR',
      'application/pdf',
      'apr.pdf',
      'user-1',
      'idem-1',
    );

    expect(queue.add).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      documentId: DOCUMENT_ID,
      status: DocumentImportStatus.DEAD_LETTER,
      queued: false,
      reused: true,
      replayState: 'failed',
      dedupeSource: 'idempotency_key',
      idempotencyKey: 'idem-1',
    });
    expect(result.message).toContain('já falhou anteriormente');
  });

  it('reutiliza a operação existente pelo hash do arquivo quando o request é repetido', async () => {
    repository.findOne.mockResolvedValueOnce(
      makeDocumentImport({
        status: DocumentImportStatus.COMPLETED,
        processingJobId: 'job-1',
        processingAttempts: 1,
      }),
    );
    queue.getJob.mockResolvedValue({
      id: 'job-1',
      attemptsMade: 1,
      opts: { attempts: 3 },
      getState: jest.fn().mockResolvedValue('completed'),
    });

    const result = await service.enqueueDocumentProcessing(
      Buffer.from('%PDF-1.4 async'),
      COMPANY_ID,
      'APR',
    );

    expect(queue.add).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      documentId: DOCUMENT_ID,
      status: DocumentImportStatus.COMPLETED,
      reused: true,
      replayState: 'completed',
      dedupeSource: 'file_hash',
    });
  });

  it('conclui a importação com compensação explícita quando a auto-criação de DDS falha', async () => {
    queryBuilder.getOne
      .mockResolvedValueOnce(
        makeDocumentImport({
          id: DOCUMENT_ID,
          status: DocumentImportStatus.QUEUED,
          tipoDocumento: 'DDS',
          processingJobId: `document-import:${DOCUMENT_ID}`,
          arquivoStaging: Buffer.from('%PDF-1.4'),
        }),
      )
      .mockResolvedValueOnce(
        makeDocumentImport({
          id: DOCUMENT_ID,
          status: DocumentImportStatus.PROCESSING,
          tipoDocumento: 'DDS',
          processingJobId: `document-import:${DOCUMENT_ID}`,
        }),
      )
      .mockResolvedValueOnce(
        makeDocumentImport({
          id: DOCUMENT_ID,
          status: DocumentImportStatus.VALIDATING,
          tipoDocumento: 'DDS',
          processingJobId: `document-import:${DOCUMENT_ID}`,
          metadata: {
            queue: {
              attempts: 3,
              timeoutMs: 180000,
              statusUrl: `/documents/import/${DOCUMENT_ID}/status`,
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        makeDocumentImport({
          id: DOCUMENT_ID,
          status: DocumentImportStatus.COMPLETED,
          tipoDocumento: 'DDS',
          processingJobId: `document-import:${DOCUMENT_ID}`,
          metadata: {
            queue: {
              attempts: 3,
              timeoutMs: 180000,
              statusUrl: `/documents/import/${DOCUMENT_ID}/status`,
            },
            autoCreateDds: {
              state: 'failed',
              requestedAt: '2026-03-20T10:00:00.000Z',
              completedAt: '2026-03-20T10:00:01.000Z',
              error: 'dds downstream failed',
            },
          },
        }),
      );
    ddsService.create.mockRejectedValue(new Error('dds downstream failed'));

    const result = await service.processQueuedDocument(DOCUMENT_ID);

    expect(ddsService.create).toHaveBeenCalledTimes(1);
    expect(repository.save).toHaveBeenCalled();
    const [savedRecord] = repository.save.mock.calls.at(-1) as [DocumentImport];
    expect(savedRecord.status).toBe(DocumentImportStatus.COMPLETED);
    expect(savedRecord.metadata?.autoCreateDds).toMatchObject({
      state: 'failed',
      error: 'dds downstream failed',
    });
    expect(result).toMatchObject({
      documentId: DOCUMENT_ID,
      status: DocumentImportStatus.COMPLETED,
      metadata: {
        autoCreateDds: {
          state: 'failed',
          error: 'dds downstream failed',
        },
      },
    });
  });

  it('não dispara novo DDS quando a compensação anterior ficou pendente', async () => {
    queryBuilder.getOne
      .mockResolvedValueOnce(
        makeDocumentImport({
          id: DOCUMENT_ID,
          status: DocumentImportStatus.QUEUED,
          tipoDocumento: 'DDS',
          processingJobId: `document-import:${DOCUMENT_ID}`,
          arquivoStaging: Buffer.from('%PDF-1.4'),
          metadata: {
            queue: {
              attempts: 3,
              timeoutMs: 180000,
              statusUrl: `/documents/import/${DOCUMENT_ID}/status`,
            },
            autoCreateDds: {
              state: 'pending',
              requestedAt: '2026-03-20T10:00:00.000Z',
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        makeDocumentImport({
          id: DOCUMENT_ID,
          status: DocumentImportStatus.PROCESSING,
          tipoDocumento: 'DDS',
          processingJobId: `document-import:${DOCUMENT_ID}`,
        }),
      )
      .mockResolvedValueOnce(
        makeDocumentImport({
          id: DOCUMENT_ID,
          status: DocumentImportStatus.VALIDATING,
          tipoDocumento: 'DDS',
          processingJobId: `document-import:${DOCUMENT_ID}`,
          metadata: {
            queue: {
              attempts: 3,
              timeoutMs: 180000,
              statusUrl: `/documents/import/${DOCUMENT_ID}/status`,
            },
            autoCreateDds: {
              state: 'pending',
              requestedAt: '2026-03-20T10:00:00.000Z',
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        makeDocumentImport({
          id: DOCUMENT_ID,
          status: DocumentImportStatus.COMPLETED,
          tipoDocumento: 'DDS',
          processingJobId: `document-import:${DOCUMENT_ID}`,
          metadata: {
            queue: {
              attempts: 3,
              timeoutMs: 180000,
              statusUrl: `/documents/import/${DOCUMENT_ID}/status`,
            },
            autoCreateDds: {
              state: 'pending',
              requestedAt: '2026-03-20T10:00:00.000Z',
            },
          },
        }),
      );

    const result = await service.processQueuedDocument(DOCUMENT_ID);

    expect(ddsService.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      documentId: DOCUMENT_ID,
      status: DocumentImportStatus.COMPLETED,
      metadata: {
        autoCreateDds: {
          state: 'pending',
        },
      },
    });
  });
});
