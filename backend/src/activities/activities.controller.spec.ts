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
import { RolesGuard } from '../auth/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';

describe('ActivitiesController (http)', () => {
  let app: INestApplication;

  const activitiesService = {
    findPaginated: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ActivitiesController],
      providers: [{ provide: ActivitiesService, useValue: activitiesService }],
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
    if (app) {
      await app.close();
    }
  });

  it('encaminha paginação válida para o service', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    activitiesService.findPaginated.mockResolvedValue({
      data: [],
      total: 0,
      page: 2,
      limit: 15,
      totalPages: 0,
    });

    await request(httpServer)
      .get('/activities?page=2&limit=15&search=solda')
      .expect(200);

    expect(activitiesService.findPaginated).toHaveBeenCalledWith({
      page: 2,
      limit: 15,
      search: 'solda',
    });
  });

  it('rejeita company_id forjado na query', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .get('/activities?company_id=tenant-forjado')
      .expect(400);

    expect(activitiesService.findPaginated).not.toHaveBeenCalled();
  });

  it('rejeita limit fora do teto permitido', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer).get('/activities?limit=500').expect(400);

    expect(activitiesService.findPaginated).not.toHaveBeenCalled();
  });
});
