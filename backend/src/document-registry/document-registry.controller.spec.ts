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
    getWeeklyBundle: jest.fn(),
  };

  beforeEach(() => {
    documentRegistryService.list.mockReset();
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
    documentRegistryService.list.mockResolvedValue([]);

    await request(httpServer)
      .get('/document-registry')
      .query({
        company_id: 'tenant-forjado',
        year: '2026',
        week: '18',
        modules: 'apr, dds',
      })
      .expect(200);

    expect(documentRegistryService.list).toHaveBeenCalledWith({
      year: 2026,
      week: 18,
      modules: ['apr', 'dds'],
    });
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
});
