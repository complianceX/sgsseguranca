/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  CallHandler,
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Observable } from 'rxjs';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RolesGuard } from '../auth/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { SitesController } from './sites.controller';
import { SitesService } from './sites.service';

describe('SitesController (http)', () => {
  let app: INestApplication;

  const sitesService = {
    findPaginated: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    sitesService.findPaginated.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
      lastPage: 0,
    });
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SitesController],
      providers: [{ provide: SitesService, useValue: sitesService }],
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
        intercept: (
          _context: ExecutionContext,
          next: CallHandler,
        ): Observable<unknown> => next.handle(),
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejeita company_id forjado na listagem de sites', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .get('/sites?company_id=tenant-forjado')
      .expect(400);

    expect(sitesService.findPaginated).not.toHaveBeenCalled();
  });

  it('encaminha query valida sem filtro de tenant controlado pelo cliente', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .get('/sites?page=2&limit=25&search=obra')
      .expect(200);

    expect(sitesService.findPaginated).toHaveBeenCalledWith({
      page: 2,
      limit: 25,
      search: 'obra',
    });
    expect(sitesService.findPaginated.mock.calls[0][0]).not.toHaveProperty(
      'companyId',
    );
  });

  it('rejeita limit acima do teto permitido', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer).get('/sites?limit=500').expect(400);

    expect(sitesService.findPaginated).not.toHaveBeenCalled();
  });
});
