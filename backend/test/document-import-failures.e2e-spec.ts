import { getQueueToken } from '@nestjs/bullmq';
import {
  CallHandler,
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import request from 'supertest';
import { Observable } from 'rxjs';
import { PermissionsGuard } from '../src/auth/permissions.guard';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { TenantGuard } from '../src/common/guards/tenant.guard';
import { TenantInterceptor } from '../src/common/tenant/tenant.interceptor';
import { TenantService } from '../src/common/tenant/tenant.service';
import { DdsService } from '../src/dds/dds.service';
import { DocumentImportController } from '../src/document-import/controllers/document-import.controller';
import {
  DocumentImportEnqueueResponseDto,
  DocumentImportStatusResponseDto,
} from '../src/document-import/dto/document-import-queue.dto';
import { DocumentImportStatus } from '../src/document-import/entities/document-import-status.enum';
import {
  DocumentImport,
  DocumentImportMetadata,
} from '../src/document-import/entities/document-import.entity';
import { DocumentClassifierService } from '../src/document-import/services/document-classifier.service';
import { DocumentImportService } from '../src/document-import/services/document-import.service';
import { DocumentInterpreterService } from '../src/document-import/services/document-interpreter.service';
import { DocumentValidationService } from '../src/document-import/services/document-validation.service';
import { FileParserService } from '../src/document-import/services/file-parser.service';

jest.setTimeout(15000);

const COMPANY_ID = '22222222-2222-4222-8222-222222222222';
const DEAD_LETTER_DOCUMENT_ID = '33333333-3333-4333-8333-333333333333';

type InMemoryDocumentImportRepository = {
  create: jest.Mock<DocumentImport, [Partial<DocumentImport>]>;
  findOne: jest.Mock<Promise<DocumentImport | null>, [unknown]>;
  save: jest.Mock<Promise<DocumentImport>, [DocumentImport]>;
  update: jest.Mock<
    Promise<{ affected: number }>,
    [Partial<DocumentImport>, Partial<DocumentImport>]
  >;
  delete: jest.Mock<Promise<{ affected: number }>, [Partial<DocumentImport>]>;
  createQueryBuilder: jest.Mock;
  seed: (record: DocumentImport) => void;
  clear: () => void;
};

type QueueState = 'waiting' | 'active' | 'completed' | 'failed' | 'dead_letter';

type InMemoryQueue = {
  add: jest.Mock;
  getJob: jest.Mock;
  setFailNextAdd: (message: string) => void;
  setJobState: (
    jobId: string,
    state: QueueState,
    attemptsMade?: number,
    maxAttempts?: number,
  ) => void;
  clear: () => void;
};

type QueueJobRecord = {
  id: string;
  state: QueueState;
  attemptsMade: number;
  maxAttempts: number;
};

const allowGuard = {
  canActivate: jest.fn(() => true),
};

const passthroughInterceptor = {
  intercept: (
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> => next.handle(),
};

function buildDocumentId(counter: number): string {
  return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
}

function cloneMetadata(
  metadata?: DocumentImportMetadata | null,
): DocumentImportMetadata | null {
  if (!metadata) {
    return null;
  }

  return structuredClone(metadata);
}

function cloneAnalysis<T>(analysis: T | null | undefined): T | null {
  if (!analysis) {
    return null;
  }

  return structuredClone(analysis);
}

function getEnqueueBody(body: unknown): DocumentImportEnqueueResponseDto {
  return body as DocumentImportEnqueueResponseDto;
}

function getStatusBody(body: unknown): DocumentImportStatusResponseDto {
  return body as DocumentImportStatusResponseDto;
}

function cloneRecord(record: DocumentImport): DocumentImport {
  return {
    ...record,
    arquivoStaging: record.arquivoStaging
      ? Buffer.from(record.arquivoStaging)
      : null,
    jsonEstruturado: cloneAnalysis(record.jsonEstruturado),
    metadata: cloneMetadata(record.metadata),
    dataDocumento: record.dataDocumento ? new Date(record.dataDocumento) : null,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
    lastAttemptAt: record.lastAttemptAt ? new Date(record.lastAttemptAt) : null,
    deadLetteredAt: record.deadLetteredAt
      ? new Date(record.deadLetteredAt)
      : null,
  } as DocumentImport;
}

function makeDocumentImport(
  overrides: Partial<DocumentImport> = {},
  fallbackId = buildDocumentId(1),
): DocumentImport {
  return {
    id: fallbackId,
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
        statusUrl: `/documents/import/${fallbackId}/status`,
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

function matchesWhere(
  record: DocumentImport,
  where: Partial<DocumentImport> | undefined,
): boolean {
  if (!where) {
    return false;
  }

  return Object.entries(where).every(([key, value]) => {
    if (typeof value === 'undefined') {
      return true;
    }

    return (record as Record<string, unknown>)[key] === value;
  });
}

function createInMemoryRepository(): InMemoryDocumentImportRepository {
  const store = new Map<string, DocumentImport>();
  let counter = 1;

  const repository: InMemoryDocumentImportRepository = {
    create: jest.fn((input: Partial<DocumentImport>) => {
      const nextId = buildDocumentId(counter++);
      return makeDocumentImport(
        {
          ...input,
          id: input.id || nextId,
          metadata: input.metadata
            ? cloneMetadata(input.metadata)
            : {
                queue: {
                  attempts: 3,
                  timeoutMs: 180000,
                  statusUrl: `/documents/import/${input.id || nextId}/status`,
                },
              },
        },
        input.id || nextId,
      );
    }),
    findOne: jest.fn((options: unknown) => {
      const where =
        typeof options === 'object' && options !== null && 'where' in options
          ? ((options as { where?: Partial<DocumentImport> }).where ?? {})
          : {};

      for (const record of store.values()) {
        if (matchesWhere(record, where)) {
          return Promise.resolve(cloneRecord(record));
        }
      }

      return Promise.resolve(null);
    }),
    save: jest.fn((input: DocumentImport) => {
      const record = cloneRecord(input);
      record.updatedAt = new Date('2026-03-20T10:00:01.000Z');
      store.set(record.id, cloneRecord(record));
      return Promise.resolve(cloneRecord(record));
    }),
    update: jest.fn(
      (criteria: Partial<DocumentImport>, patch: Partial<DocumentImport>) => {
        let affected = 0;

        for (const [id, current] of store.entries()) {
          if (!matchesWhere(current, criteria)) {
            continue;
          }

          const nextRecord = {
            ...current,
            ...patch,
            metadata:
              typeof patch.metadata === 'undefined'
                ? cloneMetadata(current.metadata)
                : cloneMetadata(patch.metadata as DocumentImportMetadata),
            arquivoStaging:
              typeof patch.arquivoStaging === 'undefined'
                ? current.arquivoStaging
                  ? Buffer.from(current.arquivoStaging)
                  : null
                : patch.arquivoStaging
                  ? Buffer.from(patch.arquivoStaging)
                  : null,
            updatedAt: new Date('2026-03-20T10:00:02.000Z'),
          } as DocumentImport;

          store.set(id, nextRecord);
          affected += 1;
        }

        return Promise.resolve({ affected });
      },
    ),
    delete: jest.fn((criteria: Partial<DocumentImport>) => {
      let affected = 0;

      for (const [id, current] of store.entries()) {
        if (!matchesWhere(current, criteria)) {
          continue;
        }

        store.delete(id);
        affected += 1;
      }

      return Promise.resolve({ affected });
    }),
    createQueryBuilder: jest.fn(() => {
      let documentId: string | undefined;
      let tenantId: string | undefined;

      const builder = {
        where: jest.fn().mockImplementation(
          (
            _query: string,
            params?: {
              documentId?: string;
            },
          ) => {
            documentId = params?.documentId;
            return builder;
          },
        ),
        andWhere: jest.fn().mockImplementation(
          (
            _query: string,
            params?: {
              tenantId?: string;
            },
          ) => {
            tenantId = params?.tenantId;
            return builder;
          },
        ),
        addSelect: jest.fn().mockImplementation(() => builder),
        getOne: jest.fn().mockImplementation(() => {
          if (!documentId) {
            return Promise.resolve(null);
          }

          const record = store.get(documentId);
          if (!record) {
            return Promise.resolve(null);
          }

          if (tenantId && record.empresaId !== tenantId) {
            return Promise.resolve(null);
          }

          return Promise.resolve(cloneRecord(record));
        }),
      };

      return builder;
    }),
    seed: (record: DocumentImport) => {
      store.set(record.id, cloneRecord(record));
    },
    clear: () => {
      store.clear();
      counter = 1;
    },
  };

  return repository;
}

function createInMemoryQueue(): InMemoryQueue {
  const jobs = new Map<string, QueueJobRecord>();
  let failNextAddMessage: string | null = null;

  return {
    add: jest.fn(
      (
        _jobName: string,
        _payload: unknown,
        options?: {
          attempts?: number;
          jobId?: string;
        },
      ) => {
        if (failNextAddMessage) {
          const message = failNextAddMessage;
          failNextAddMessage = null;
          throw new Error(message);
        }

        const jobId = String(options?.jobId || `job-${jobs.size + 1}`);
        jobs.set(jobId, {
          id: jobId,
          state: 'waiting',
          attemptsMade: 0,
          maxAttempts: options?.attempts ?? 1,
        });

        return Promise.resolve({ id: jobId });
      },
    ),
    getJob: jest.fn((jobId: string) => {
      const job = jobs.get(jobId);
      if (!job) {
        return Promise.resolve(null);
      }

      return Promise.resolve({
        id: job.id,
        attemptsMade: job.attemptsMade,
        opts: {
          attempts: job.maxAttempts,
        },
        getState: jest.fn(() => Promise.resolve(job.state)),
      });
    }),
    setFailNextAdd: (message: string) => {
      failNextAddMessage = message;
    },
    setJobState: (
      jobId: string,
      state: QueueState,
      attemptsMade = 0,
      maxAttempts = 3,
    ) => {
      jobs.set(jobId, {
        id: jobId,
        state,
        attemptsMade,
        maxAttempts,
      });
    },
    clear: () => {
      jobs.clear();
      failNextAddMessage = null;
    },
  };
}

describe('DocumentImport failure flows (e2e)', () => {
  let app: INestApplication;
  let repository: InMemoryDocumentImportRepository;
  let queue: InMemoryQueue;
  const getHttpServer = (): Parameters<typeof request>[0] =>
    app.getHttpServer() as Parameters<typeof request>[0];

  const fileParserService = {
    generateFileHash: jest.fn((buffer: Buffer) =>
      createHash('sha256').update(buffer).digest('hex'),
    ),
    extractText: jest.fn().mockResolvedValue('conteudo extraido'),
  };
  const documentClassifierService = {
    getDocumentTypeDescription: jest.fn().mockReturnValue('APR'),
    classifyDocument: jest.fn().mockResolvedValue({
      tipoDocumento: 'APR',
      score: 0.91,
    }),
  };
  const documentInterpreterService = {
    interpretDocument: jest.fn().mockResolvedValue({
      tipoDocumento: 'APR',
      scoreConfianca: 0.88,
    }),
  };
  const documentValidationService = {
    validateDocument: jest.fn().mockReturnValue({
      status: 'VALIDO',
      pendencias: [],
      scoreConfianca: 88,
    }),
  };
  const ddsService = {
    create: jest.fn(),
  };
  const tenantService = {
    getTenantId: jest.fn(() => COMPANY_ID),
    isSuperAdmin: jest.fn(() => false),
  };

  const postDocument = (
    file: Buffer,
    options?: {
      filename?: string;
      contentType?: string;
      idempotencyKey?: string;
      tipoDocumento?: string;
    },
  ) => {
    const requestBuilder = request(getHttpServer())
      .post('/documents/import')
      .field('tipoDocumento', options?.tipoDocumento || 'APR')
      .attach('file', file, {
        filename: options?.filename || 'document.pdf',
        contentType: options?.contentType || 'application/pdf',
      });

    if (options?.idempotencyKey) {
      requestBuilder.set('Idempotency-Key', options.idempotencyKey);
    }

    return requestBuilder;
  };

  beforeAll(async () => {
    repository = createInMemoryRepository();
    queue = createInMemoryQueue();

    const moduleBuilder = Test.createTestingModule({
      controllers: [DocumentImportController],
      providers: [
        DocumentImportService,
        {
          provide: getRepositoryToken(DocumentImport),
          useValue: repository,
        },
        {
          provide: FileParserService,
          useValue: fileParserService,
        },
        {
          provide: DocumentClassifierService,
          useValue: documentClassifierService,
        },
        {
          provide: DocumentInterpreterService,
          useValue: documentInterpreterService,
        },
        {
          provide: DocumentValidationService,
          useValue: documentValidationService,
        },
        {
          provide: DdsService,
          useValue: ddsService,
        },
        {
          provide: TenantService,
          useValue: tenantService,
        },
        {
          provide: getQueueToken('document-import'),
          useValue: queue,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(allowGuard)
      .overrideGuard(TenantGuard)
      .useValue(allowGuard)
      .overrideGuard(RolesGuard)
      .useValue(allowGuard)
      .overrideGuard(PermissionsGuard)
      .useValue(allowGuard)
      .overrideInterceptor(TenantInterceptor)
      .useValue(passthroughInterceptor);

    const moduleRef = await moduleBuilder.compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
  });

  beforeEach(() => {
    repository.clear();
    queue.clear();
    jest.clearAllMocks();
    tenantService.getTenantId.mockReturnValue(COMPANY_ID);
    tenantService.isSuperAdmin.mockReturnValue(false);
    fileParserService.generateFileHash.mockImplementation((buffer: Buffer) =>
      createHash('sha256').update(buffer).digest('hex'),
    );
    fileParserService.extractText.mockResolvedValue('conteudo extraido');
    documentClassifierService.getDocumentTypeDescription.mockReturnValue('APR');
    documentClassifierService.classifyDocument.mockResolvedValue({
      tipoDocumento: 'APR',
      score: 0.91,
    });
    documentInterpreterService.interpretDocument.mockResolvedValue({
      tipoDocumento: 'APR',
      scoreConfianca: 0.88,
    });
    documentValidationService.validateDocument.mockReturnValue({
      status: 'VALIDO',
      pendencias: [],
      scoreConfianca: 88,
    });
    ddsService.create.mockReset();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('rejeita payload inconsistente quando o arquivo não bate com o tipo aceito', async () => {
    const response = await postDocument(Buffer.from('arquivo invalido'), {
      filename: 'invalid.pdf',
      contentType: 'application/pdf',
    }).expect(400);

    const body = response.body as { message?: string };
    expect(body.message).toBe('Tipo de arquivo não permitido');
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('reutiliza a mesma operação quando o usuário reenviar o mesmo arquivo com a mesma Idempotency-Key', async () => {
    const pdfBuffer = Buffer.from('%PDF-1.4 idempotent');

    const firstResponse = await postDocument(pdfBuffer, {
      idempotencyKey: 'idem-apr-1',
      filename: 'apr.pdf',
    }).expect(202);

    const secondResponse = await postDocument(pdfBuffer, {
      idempotencyKey: 'idem-apr-1',
      filename: 'apr.pdf',
    }).expect(202);

    const firstBody = getEnqueueBody(firstResponse.body);
    const secondBody = getEnqueueBody(secondResponse.body);

    expect(firstBody.reused).toBe(false);
    expect(firstBody.replayState).toBe('new');
    expect(secondBody.reused).toBe(true);
    expect(secondBody.replayState).toBe('in_progress');
    expect(secondBody.dedupeSource).toBe('idempotency_key');
    expect(secondBody.documentId).toBe(firstBody.documentId);
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('bloqueia replay com a mesma Idempotency-Key para outro arquivo', async () => {
    await postDocument(Buffer.from('%PDF-1.4 original'), {
      idempotencyKey: 'idem-apr-2',
      filename: 'original.pdf',
    }).expect(202);

    const conflictResponse = await postDocument(
      Buffer.from('%PDF-1.4 diferente'),
      {
        idempotencyKey: 'idem-apr-2',
        filename: 'diferente.pdf',
      },
    ).expect(409);

    const body = conflictResponse.body as { message?: string };
    expect(body.message).toBe(
      'A mesma Idempotency-Key já foi utilizada para outro arquivo.',
    );
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('expõe falha explícita e status consultável quando a fila fica indisponível', async () => {
    queue.setFailNextAdd('redis queue unavailable');

    const failedEnqueueResponse = await postDocument(
      Buffer.from('%PDF-1.4 queue down'),
      {
        idempotencyKey: 'idem-apr-3',
        filename: 'queue-down.pdf',
      },
    ).expect(503);

    const failedEnqueueBody = failedEnqueueResponse.body as {
      message?: string;
      documentId?: string;
      statusUrl?: string;
    };
    expect(failedEnqueueBody.message).toBe(
      'Fila de importação indisponível. O documento não foi processado.',
    );
    expect(failedEnqueueBody.documentId).toBeDefined();
    expect(failedEnqueueBody.statusUrl).toMatch(
      /^\/documents\/import\/.+\/status$/,
    );

    const failedStatusResponse = await request(getHttpServer())
      .get(failedEnqueueBody.statusUrl as string)
      .expect(200);

    const failedStatusBody = getStatusBody(failedStatusResponse.body);

    expect(failedStatusBody.status).toBe(DocumentImportStatus.FAILED);
    expect(failedStatusBody.failed).toBe(true);
    expect(failedStatusBody.job.queueState).toBe('failed');
    expect(failedStatusBody.metadata?.erro).toBe('redis queue unavailable');
  });

  it('permite consultar operação terminal em DEAD_LETTER para investigação', async () => {
    repository.seed(
      makeDocumentImport(
        {
          id: DEAD_LETTER_DOCUMENT_ID,
          empresaId: COMPANY_ID,
          status: DocumentImportStatus.DEAD_LETTER,
          processingJobId: `document-import:${DEAD_LETTER_DOCUMENT_ID}`,
          processingAttempts: 3,
          mensagemErro: 'parse timeout',
          deadLetteredAt: new Date('2026-03-20T10:05:00.000Z'),
          metadata: {
            queue: {
              attempts: 3,
              timeoutMs: 180000,
              statusUrl: `/documents/import/${DEAD_LETTER_DOCUMENT_ID}/status`,
              lastQueueState: 'dead_letter',
            },
            erro: 'parse timeout',
            timestampFalha: '2026-03-20T10:05:00.000Z',
          },
        },
        DEAD_LETTER_DOCUMENT_ID,
      ),
    );

    const deadLetterStatusResponse = await request(getHttpServer())
      .get(`/documents/import/${DEAD_LETTER_DOCUMENT_ID}/status`)
      .expect(200);

    const deadLetterStatusBody = getStatusBody(deadLetterStatusResponse.body);

    expect(deadLetterStatusBody.status).toBe(DocumentImportStatus.DEAD_LETTER);
    expect(deadLetterStatusBody.failed).toBe(true);
    expect(deadLetterStatusBody.job.deadLettered).toBe(true);
    expect(deadLetterStatusBody.message).toBe('parse timeout');
  });
});
