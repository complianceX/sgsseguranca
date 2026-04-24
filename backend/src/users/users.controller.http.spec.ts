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
import { SensitiveActionGuard } from '../common/security/sensitive-action.guard';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { WorkerOperationalStatusService } from './worker-operational-status.service';
import { WorkerTimelineService } from './worker-timeline.service';
import { ConsentsService } from '../consents/consents.service';

describe('UsersController (http)', () => {
  let app: INestApplication;

  const usersService = {
    findPaginated: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    usersService.findPaginated.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
      lastPage: 0,
    });
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: usersService },
        { provide: WorkerOperationalStatusService, useValue: {} },
        { provide: WorkerTimelineService, useValue: {} },
        { provide: ConsentsService, useValue: {} },
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

  it('rejeita company_id forjado na listagem de usuarios', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .get('/users?company_id=tenant-forjado')
      .expect(400);

    expect(usersService.findPaginated).not.toHaveBeenCalled();
  });

  it('encaminha query valida sem filtro de tenant controlado pelo cliente', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .get(
        '/users?page=2&limit=25&search=Ana&site_id=11111111-1111-4111-8111-111111111111',
      )
      .expect(200);

    expect(usersService.findPaginated).toHaveBeenCalledWith({
      page: 2,
      limit: 25,
      search: 'Ana',
      siteId: '11111111-1111-4111-8111-111111111111',
    });
    expect(usersService.findPaginated.mock.calls[0][0]).not.toHaveProperty(
      'companyId',
    );
  });

  it('rejeita limit acima do teto permitido', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer).get('/users?limit=500').expect(400);

    expect(usersService.findPaginated).not.toHaveBeenCalled();
  });
});
