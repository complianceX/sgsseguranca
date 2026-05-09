import {
  CallHandler,
  ExecutionContext,
  INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Observable } from 'rxjs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RolesGuard } from '../auth/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { SensitiveActionGuard } from '../common/security/sensitive-action.guard';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { DocumentRegistryController } from './document-registry.controller';
import { DocumentRegistryService } from './document-registry.service';

describe('DocumentRegistryController (http)', () => {
  let app: INestApplication;

  const documentRegistryService = {
    list: jest.fn(),
    getPdfAccess: jest.fn(),
    getWeeklyBundle: jest.fn(),
  };

  beforeEach(() => {
    documentRegistryService.list.mockReset();
    documentRegistryService.getPdfAccess.mockReset();
    documentRegistryService.getWeeklyBundle.mockReset();
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DocumentRegistryController],
      providers: [
        {
          provide: DocumentRegistryService,
          useValue: documentRegistryService,
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
      .overrideGuard(SensitiveActionGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(TenantInterceptor)
      .useValue({
        intercept: (
          _context: ExecutionContext,
          next: CallHandler,
        ): Observable<unknown> => next.handle(),
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('ignora company_id do client na listagem do registry', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    documentRegistryService.list.mockResolvedValue([
      {
        id: 'registry-1',
        company_id: 'company-1',
        module: 'apr',
        document_type: 'pdf',
        entity_id: 'apr-1',
        title: 'APR final',
        document_date: null,
        iso_year: 2026,
        iso_week: 18,
        file_key: 'documents/company-1/apr/sites/site-1/apr-1/final.pdf',
        folder_path: 'documents/company-1/apr/sites/site-1/apr-1',
        original_name: 'apr-final.pdf',
        mime_type: 'application/pdf',
        file_hash: 'hash-interno',
        document_code: 'APR-2026-18-0001',
        created_by: 'user-1',
        created_at: new Date('2026-05-01T00:00:00Z'),
        updated_at: new Date('2026-05-01T00:00:00Z'),
      },
    ]);

    const response = await request(httpServer)
      .get('/document-registry')
      .query({
        company_id: 'tenant-forjado',
        year: '2026',
        week: '18',
        modules: 'apr, dds',
      })
      .expect(200);

    const [publicEntry] = response.body as Array<Record<string, unknown>>;

    expect(publicEntry).toMatchObject({
      id: 'registry-1',
      module: 'apr',
      entity_id: 'apr-1',
      original_name: 'apr-final.pdf',
    });
    expect(publicEntry).not.toHaveProperty('file_key');
    expect(publicEntry).not.toHaveProperty('folder_path');
    expect(publicEntry).not.toHaveProperty('file_hash');
    expect(publicEntry).not.toHaveProperty('created_by');

    expect(documentRegistryService.list).toHaveBeenCalledWith({
      year: 2026,
      week: 18,
      modules: ['apr', 'dds'],
    });
  });

  it('expõe acesso individual ao PDF arquivado sem aceitar company_id do client', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const registryId = '11111111-1111-4111-8111-111111111111';
    documentRegistryService.getPdfAccess.mockResolvedValue({
      entityId: 'dds-1',
      hasFinalPdf: true,
      availability: 'ready',
      message: null,
      fileKey: 'documents/company-1/dds/sites/site-1/dds-1/final.pdf',
      folderPath: 'documents/company-1/dds/sites/site-1/dds-1',
      originalName: 'dds-final.pdf',
      url: '/storage/download/token',
    });

    await request(httpServer)
      .get(`/document-registry/${registryId}/pdf`)
      .query({ company_id: 'tenant-forjado' })
      .expect(200);

    expect(documentRegistryService.getPdfAccess).toHaveBeenCalledWith(
      registryId,
    );
  });

  it('ignora company_id do client no bundle semanal do registry', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    documentRegistryService.getWeeklyBundle.mockResolvedValue({
      buffer: Buffer.from('registry bundle'),
      fileName: 'registry.pdf',
    });

    await request(httpServer)
      .get('/document-registry/weekly-bundle')
      .query({
        company_id: 'tenant-forjado',
        year: '2026',
        week: '18',
        modules: 'apr,dds',
      })
      .expect(200);

    expect(documentRegistryService.getWeeklyBundle).toHaveBeenCalledWith({
      year: 2026,
      week: 18,
      modules: ['apr', 'dds'],
    });
  });

  it('rejeita ano e semana inválidos antes de consultar o registry', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .get('/document-registry')
      .query({ year: 'abc', week: '99' })
      .expect(400);

    expect(documentRegistryService.list).not.toHaveBeenCalled();
  });
});
