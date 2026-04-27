import {
  CallHandler,
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Observable } from 'rxjs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { FileInspectionService } from '../common/security/file-inspection.service';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { NonConformitiesController } from './nonconformities.controller';
import { NonConformitiesService } from './nonconformities.service';

describe('NonConformitiesController (http)', () => {
  let app: INestApplication;

  const nonConformitiesService = {
    findPaginated: jest.fn(),
    listStoredFiles: jest.fn(),
    getWeeklyBundle: jest.fn(),
  };

  beforeEach(() => {
    nonConformitiesService.findPaginated.mockReset();
    nonConformitiesService.listStoredFiles.mockReset();
    nonConformitiesService.getWeeklyBundle.mockReset();
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [NonConformitiesController],
      providers: [
        {
          provide: NonConformitiesService,
          useValue: nonConformitiesService,
        },
        {
          provide: FileInspectionService,
          useValue: { inspectBuffer: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(TenantGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
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
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('valida paginação e busca da listagem de NC via DTO dedicado', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    nonConformitiesService.findPaginated.mockResolvedValue({
      data: [],
      total: 0,
      page: 2,
      limit: 30,
    });

    await request(httpServer)
      .get('/nonconformities')
      .query({
        page: '2',
        limit: '30',
        search: '  solda  ',
      })
      .expect(200);

    expect(nonConformitiesService.findPaginated).toHaveBeenCalledWith({
      page: 2,
      limit: 30,
      search: 'solda',
    });
  });

  it('rejeita limit fora da faixa válida na listagem de NC', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .get('/nonconformities')
      .query({ limit: '500' })
      .expect(400);

    expect(nonConformitiesService.findPaginated).not.toHaveBeenCalled();
  });

  it('ignora company_id do client na listagem de arquivos de NC', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    nonConformitiesService.listStoredFiles.mockResolvedValue([]);

    await request(httpServer)
      .get('/nonconformities/files/list')
      .query({
        company_id: 'tenant-forjado',
        year: '2026',
        week: '22',
      })
      .expect(200);

    expect(nonConformitiesService.listStoredFiles).toHaveBeenCalledWith({
      year: 2026,
      week: 22,
    });
  });

  it('rejeita semana inválida na listagem de arquivos de NC', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .get('/nonconformities/files/list')
      .query({ week: '99' })
      .expect(400);

    expect(nonConformitiesService.listStoredFiles).not.toHaveBeenCalled();
  });

  it('ignora company_id do client no bundle semanal de NC', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    nonConformitiesService.getWeeklyBundle.mockResolvedValue({
      buffer: Buffer.from('nc bundle'),
      fileName: 'nc.pdf',
    });

    await request(httpServer)
      .get('/nonconformities/files/weekly-bundle')
      .query({
        company_id: 'tenant-forjado',
        year: '2026',
        week: '22',
      })
      .expect(200);

    expect(nonConformitiesService.getWeeklyBundle).toHaveBeenCalledWith({
      year: 2026,
      week: 22,
    });
  });
});
