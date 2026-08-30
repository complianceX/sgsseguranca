/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { createHash, randomUUID } from 'node:crypto';
import { StorageController } from '../../src/infra/storage/storage.controller';
import { DocumentStorageService } from '../../src/shared/services/document-storage.service';
import { TenantService } from '../../src/shared/tenant/tenant.service';
import { AuditService } from '../../src/modules/audit-trail/audit.service';
import { FileInspectionService } from '../../src/shared/security/file-inspection.service';
import { JwtAuthGuard } from '../../src/modules/auth/jwt-auth.guard';
import { TenantGuard } from '../../src/shared/guards/tenant.guard';
import { RolesGuard } from '../../src/modules/auth/roles.guard';
import { TenantInterceptor } from '../../src/shared/tenant/tenant.interceptor';
import { PermissionsGuard } from '../../src/modules/auth/permissions.guard';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const PDF_BUFFER = Buffer.concat([
  Buffer.from('%PDF-', 'ascii'),
  Buffer.from('fase-3-e2e'),
]);

describe('E2E Fase 3 - storage quarantine flow', () => {
  let app: INestApplication;
  let storageService: {
    referenceForExistingObject: jest.Mock;
    createReference: jest.Mock;
    getPresignedUploadUrl: jest.Mock;
    downloadFileBuffer: jest.Mock;
    uploadFile: jest.Mock;
    deleteFile: jest.Mock;
  };

  beforeAll(async () => {
    storageService = {
      referenceForExistingObject: jest.fn(
        (key: string, owner: object, purpose: string) => ({
          tenantId: TENANT_ID,
          key,
          owner,
          purpose,
        }),
      ),
      createReference: jest.fn((reference: object) => reference),
      getPresignedUploadUrl: jest
        .fn()
        .mockResolvedValue('https://bucket.example.com/upload'),
      downloadFileBuffer: jest.fn().mockResolvedValue(PDF_BUFFER),
      uploadFile: jest.fn().mockResolvedValue(undefined),
      deleteFile: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [StorageController],
      providers: [
        {
          provide: DocumentStorageService,
          useValue: storageService,
        },
        {
          provide: TenantService,
          useValue: {
            getTenantId: jest.fn().mockReturnValue(TENANT_ID),
            isSuperAdmin: jest.fn().mockReturnValue(false),
          },
        },
        {
          provide: AuditService,
          useValue: {
            log: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: FileInspectionService,
          useValue: {
            inspect: jest.fn().mockResolvedValue({
              clean: true,
              provider: 'clamav',
            }),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(TenantGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(TenantInterceptor)
      .useValue({
        intercept: (_ctx: unknown, next: { handle: () => unknown }) =>
          next.handle(),
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('mantém o contrato em 3 etapas e promove apenas após complete-upload', async () => {
    const presigned = await request(app.getHttpServer())
      .post('/storage/presigned-url')
      .send({ filename: 'fase3.pdf', contentType: 'application/pdf' });

    expect(presigned.status).toBe(201);
    expect(presigned.body.fileKey).toMatch(
      /^quarantine\/11111111-1111-4111-8111-111111111111\/[0-9a-f-]{36}\.pdf$/i,
    );

    const sha256 = createHash('sha256').update(PDF_BUFFER).digest('hex');
    const completion = await request(app.getHttpServer())
      .post('/storage/complete-upload')
      .send({
        fileKey: presigned.body.fileKey,
        originalFilename: 'fase3.pdf',
        sha256,
      });

    expect(completion.status).toBe(201);
    expect(completion.body).toEqual(
      expect.objectContaining({
        fileKey: expect.stringMatching(
          /^documents\/11111111-1111-4111-8111-111111111111\/[0-9a-f-]{36}\.pdf$/i,
        ),
        sha256Verified: true,
      }),
    );
    expect(storageService.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringMatching(/^documents\//),
      }),
      expect.any(Buffer),
      'application/pdf',
    );
    expect(storageService.deleteFile).toHaveBeenCalledWith(
      expect.objectContaining({ key: presigned.body.fileKey }),
    );
  });

  it('bloqueia promoção se a chave não vier da quarentena do tenant', async () => {
    const response = await request(app.getHttpServer())
      .post('/storage/complete-upload')
      .send({
        fileKey: `quarantine/${randomUUID()}/${randomUUID()}.pdf`,
      });

    expect(response.status).toBe(403);
  });
});
