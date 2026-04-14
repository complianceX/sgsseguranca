/**
 * Fase 3 — Testes P1: StorageController
 *
 * 1. presigned-url → fileKey usa prefixo quarantine/ (não documents/)
 * 2. complete-upload:
 *    a. fileKey fora do prefixo esperado → 403
 *    b. arquivo ausente no S3 → 400
 *    c. arquivo vazio → 400
 *    d. tamanho acima do limite → 400
 *    e. magic bytes inválidos → 400
 *    f. SHA-256 inválido → 400
 *    g. FileInspectionService fail → erro propagado
 *    h. fluxo feliz → retorna documentsKey + sizeBytes + sha256Verified
 * 3. Auditoria de quarentena registra destination=quarantine
 */

import { INestApplication, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';

import { StorageController } from './storage.controller';
import { StorageService } from '../common/services/storage.service';
import { TenantService } from '../common/tenant/tenant.service';
import { AuditService } from '../audit/audit.service';
import { FileInspectionService } from '../common/security/file-inspection.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../auth/roles.guard';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { PermissionsGuard } from '../auth/permissions.guard';

// ─── Mocks de infra ────────────────────────────────────────────────────────

const TENANT_ID = randomUUID();
const QUARANTINE_KEY = `quarantine/${TENANT_ID}/${randomUUID()}.pdf`;

const PDF_VALID_BUFFER = Buffer.concat([
  Buffer.from('%PDF-', 'ascii'),
  Buffer.alloc(100, 0),
]);

const makeStorageService = () => ({
  getPresignedUploadUrl: jest
    .fn()
    .mockResolvedValue('https://s3.example.com/upload'),
  downloadFileBuffer: jest.fn().mockResolvedValue(PDF_VALID_BUFFER),
  upload: jest.fn().mockResolvedValue(undefined),
  deleteFile: jest.fn().mockResolvedValue(undefined),
});

const makeTenantService = () => ({
  getTenantId: jest.fn().mockReturnValue(TENANT_ID),
  isSuperAdmin: jest.fn().mockReturnValue(false),
});

const makeAuditService = () => ({
  log: jest.fn().mockResolvedValue(undefined),
});

const makeFileInspectionService = () => ({
  inspect: jest.fn().mockResolvedValue({ clean: true, provider: 'none' }),
  rejectThreat: jest.fn(),
});

// Guards que permitem tudo (simula autenticação bem-sucedida)
const allowAllGuard = { canActivate: () => true };
// Interceptor vazio
const noopInterceptor = {
  intercept: (_ctx: unknown, next: { handle: () => unknown }) => next.handle(),
};

async function buildApp(overrides?: {
  storageService?: Partial<ReturnType<typeof makeStorageService>>;
  tenantService?: Partial<ReturnType<typeof makeTenantService>>;
  fileInspection?: Partial<ReturnType<typeof makeFileInspectionService>>;
}): Promise<{
  app: INestApplication;
  storage: ReturnType<typeof makeStorageService>;
  tenant: ReturnType<typeof makeTenantService>;
  audit: ReturnType<typeof makeAuditService>;
  fileInspection: ReturnType<typeof makeFileInspectionService>;
}> {
  const storage = { ...makeStorageService(), ...(overrides?.storageService ?? {}) };
  const tenant = { ...makeTenantService(), ...(overrides?.tenantService ?? {}) };
  const audit = makeAuditService();
  const fileInspection = {
    ...makeFileInspectionService(),
    ...(overrides?.fileInspection ?? {}),
  };

  const module = await Test.createTestingModule({
    controllers: [StorageController],
    providers: [
      { provide: StorageService, useValue: storage },
      { provide: TenantService, useValue: tenant },
      { provide: AuditService, useValue: audit },
      { provide: FileInspectionService, useValue: fileInspection },
    ],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue(allowAllGuard)
    .overrideGuard(TenantGuard)
    .useValue(allowAllGuard)
    .overrideGuard(RolesGuard)
    .useValue(allowAllGuard)
    .overrideGuard(PermissionsGuard)
    .useValue(allowAllGuard)
    .overrideInterceptor(TenantInterceptor)
    .useValue(noopInterceptor)
    .compile();

  const app = module.createNestApplication();
  await app.init();
  return { app, storage, tenant, audit, fileInspection };
}

// ─── Testes ────────────────────────────────────────────────────────────────

describe('StorageController P1 — Quarantine Flow', () => {
  describe('POST /storage/presigned-url — prefixo quarantine/', () => {
    let app: INestApplication;
    let storage: ReturnType<typeof makeStorageService>;

    beforeAll(async () => {
      const ctx = await buildApp();
      app = ctx.app;
      storage = ctx.storage;
    });
    afterAll(() => app.close());

    it('fileKey retornado começa com quarantine/ (não documents/)', async () => {
      const res = await request(app.getHttpServer())
        .post('/storage/presigned-url')
        .send({ filename: 'documento.pdf', contentType: 'application/pdf' });

      expect(res.status).toBe(201);
      const body = res.body as { fileKey: string };
      expect(body.fileKey).toMatch(/^quarantine\//);
      expect(body.fileKey).not.toMatch(/^documents\//);
    });

    it('fileKey inclui o tenantId correto', async () => {
      const res = await request(app.getHttpServer())
        .post('/storage/presigned-url')
        .send({ filename: 'documento.pdf', contentType: 'application/pdf' });

      expect(res.status).toBe(201);
      const body = res.body as { fileKey: string };
      expect(body.fileKey).toContain(TENANT_ID);
    });

    it('expiresIn é <= 600 (TTL guardrail P0 preservado)', async () => {
      const res = await request(app.getHttpServer())
        .post('/storage/presigned-url')
        .send({ filename: 'documento.pdf', contentType: 'application/pdf' });

      expect(res.status).toBe(201);
      const body = res.body as { expiresIn: number };
      expect(body.expiresIn).toBeLessThanOrEqual(600);
    });

    it('auditoria registra destination=quarantine', async () => {
      const auditMock = jest.fn().mockResolvedValue(undefined);
      const ctx2 = await buildApp({
        storageService: { getPresignedUploadUrl: jest.fn().mockResolvedValue('https://s3.example.com/x') },
      });
      // reaplica o mock de audit
      const auditSvc = ctx2.audit;
      auditSvc.log.mockClear();

      const res = await request(ctx2.app.getHttpServer())
        .post('/storage/presigned-url')
        .send({ filename: 'doc.pdf', contentType: 'application/pdf' });

      expect(res.status).toBe(201);
      expect(auditSvc.log).toHaveBeenCalledWith(
        expect.objectContaining({
          changes: expect.objectContaining({
            after: expect.objectContaining({ destination: 'quarantine' }),
          }),
        }),
      );
      await ctx2.app.close();
    });
  });

  describe('POST /storage/complete-upload', () => {
    it('fileKey fora do prefixo do tenant → 403', async () => {
      const { app } = await buildApp();
      const otherTenantKey = `quarantine/${randomUUID()}/file.pdf`;
      const res = await request(app.getHttpServer())
        .post('/storage/complete-upload')
        .send({ fileKey: otherTenantKey });
      expect(res.status).toBe(403);
      await app.close();
    });

    it('fileKey em documents/ em vez de quarantine/ → 403', async () => {
      const { app } = await buildApp();
      const docKey = `documents/${TENANT_ID}/file.pdf`;
      const res = await request(app.getHttpServer())
        .post('/storage/complete-upload')
        .send({ fileKey: docKey });
      expect(res.status).toBe(403);
      await app.close();
    });

    it('arquivo ausente no S3 → 400', async () => {
      const { app } = await buildApp({
        storageService: {
          downloadFileBuffer: jest
            .fn()
            .mockRejectedValue(new Error('NoSuchKey')),
        },
      });
      const res = await request(app.getHttpServer())
        .post('/storage/complete-upload')
        .send({ fileKey: QUARANTINE_KEY });
      expect(res.status).toBe(400);
      await app.close();
    });

    it('arquivo vazio → 400', async () => {
      const { app } = await buildApp({
        storageService: {
          downloadFileBuffer: jest.fn().mockResolvedValue(Buffer.alloc(0)),
        },
      });
      const res = await request(app.getHttpServer())
        .post('/storage/complete-upload')
        .send({ fileKey: QUARANTINE_KEY });
      expect(res.status).toBe(400);
      await app.close();
    });

    it('arquivo acima de 50 MB → 400', async () => {
      const bigBuffer = Buffer.concat([
        Buffer.from('%PDF-', 'ascii'),
        Buffer.alloc(51 * 1024 * 1024, 0),
      ]);
      const { app } = await buildApp({
        storageService: {
          downloadFileBuffer: jest.fn().mockResolvedValue(bigBuffer),
          deleteFile: jest.fn().mockResolvedValue(undefined),
        },
      });
      const res = await request(app.getHttpServer())
        .post('/storage/complete-upload')
        .send({ fileKey: QUARANTINE_KEY });
      expect(res.status).toBe(400);
      await app.close();
    });

    it('magic bytes inválidos (não PDF) → 400', async () => {
      const notPdf = Buffer.from('PK\x03\x04fake zip content');
      const { app } = await buildApp({
        storageService: {
          downloadFileBuffer: jest.fn().mockResolvedValue(notPdf),
          deleteFile: jest.fn().mockResolvedValue(undefined),
        },
      });
      const res = await request(app.getHttpServer())
        .post('/storage/complete-upload')
        .send({ fileKey: QUARANTINE_KEY });
      expect(res.status).toBe(400);
      await app.close();
    });

    it('SHA-256 incorreto → 400', async () => {
      const { app } = await buildApp();
      const res = await request(app.getHttpServer())
        .post('/storage/complete-upload')
        .send({ fileKey: QUARANTINE_KEY, sha256: 'aabbcc' + '0'.repeat(58) });
      expect(res.status).toBe(400);
      await app.close();
    });

    it('SHA-256 correto → 201', async () => {
      const hash = createHash('sha256')
        .update(PDF_VALID_BUFFER)
        .digest('hex');
      const { app } = await buildApp();
      const res = await request(app.getHttpServer())
        .post('/storage/complete-upload')
        .send({ fileKey: QUARANTINE_KEY, sha256: hash });
      expect(res.status).toBe(201);
      const body = res.body as { sha256Verified: boolean };
      expect(body.sha256Verified).toBe(true);
      await app.close();
    });

    it('FileInspectionService lança → erro propagado (503 ou 422)', async () => {
      const { app } = await buildApp({
        fileInspection: {
          inspect: jest.fn().mockRejectedValue(
            new (require('@nestjs/common').ServiceUnavailableException)(
              'AV indisponível',
            ),
          ),
        },
      });
      const res = await request(app.getHttpServer())
        .post('/storage/complete-upload')
        .send({ fileKey: QUARANTINE_KEY });
      expect([503, 422]).toContain(res.status);
      await app.close();
    });

    it('fluxo feliz → 201, documentsKey começa com documents/', async () => {
      const { app, storage } = await buildApp();
      const res = await request(app.getHttpServer())
        .post('/storage/complete-upload')
        .send({ fileKey: QUARANTINE_KEY });

      expect(res.status).toBe(201);
      const body = res.body as {
        fileKey: string;
        sizeBytes: number;
        sha256Verified: boolean;
      };
      expect(body.fileKey).toMatch(/^documents\//);
      expect(body.fileKey).toContain(TENANT_ID);
      expect(typeof body.sizeBytes).toBe('number');
      expect(body.sizeBytes).toBeGreaterThan(0);
      expect(body.sha256Verified).toBe(false);
      await app.close();
    });

    it('fluxo feliz → arquivo da quarentena é deletado', async () => {
      const { app, storage } = await buildApp();
      await request(app.getHttpServer())
        .post('/storage/complete-upload')
        .send({ fileKey: QUARANTINE_KEY });

      expect(storage.deleteFile).toHaveBeenCalledWith(QUARANTINE_KEY);
      await app.close();
    });

    it('fluxo feliz → upload feito para documents/ com contentType application/pdf', async () => {
      const { app, storage } = await buildApp();
      await request(app.getHttpServer())
        .post('/storage/complete-upload')
        .send({ fileKey: QUARANTINE_KEY });

      expect(storage.upload).toHaveBeenCalledWith(
        expect.stringMatching(/^documents\//),
        expect.any(Buffer),
        'application/pdf',
      );
      await app.close();
    });

    it('body de erro 400 não expõe stack trace', async () => {
      const notPdf = Buffer.from('not a pdf file');
      const { app } = await buildApp({
        storageService: {
          downloadFileBuffer: jest.fn().mockResolvedValue(notPdf),
          deleteFile: jest.fn().mockResolvedValue(undefined),
        },
      });
      const res = await request(app.getHttpServer())
        .post('/storage/complete-upload')
        .send({ fileKey: QUARANTINE_KEY });

      expect(res.status).toBe(400);
      const bodyText = JSON.stringify(res.body);
      expect(bodyText).not.toContain('stack');
      expect(bodyText).not.toContain('Error:');
      await app.close();
    });
  });
});
