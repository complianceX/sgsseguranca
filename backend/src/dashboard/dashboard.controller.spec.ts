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
import { Role } from '../auth/enums/roles.enum';
import { RolesGuard } from '../auth/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

describe('DashboardController (http)', () => {
  let app: INestApplication;

  const dashboardService = {
    getDocumentPendencies: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    dashboardService.getDocumentPendencies.mockResolvedValue({
      degraded: false,
      failedSources: [],
      summary: { total: 0, byCriticality: {}, byType: [], byModule: [] },
      filtersApplied: { companyId: 'tenant-auth' },
      pagination: { page: 1, limit: 20, total: 0, lastPage: 0 },
      items: [],
    });
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [{ provide: DashboardService, useValue: dashboardService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest<{
            user?: Record<string, unknown>;
            tenant?: { companyId: string };
          }>();
          req.user = {
            id: 'user-1',
            userId: 'user-1',
            company_id: 'tenant-auth',
            permissions: ['can_view_dashboard'],
            roles: [Role.ADMIN_EMPRESA],
          };
          req.tenant = { companyId: 'tenant-auth' };
          return true;
        },
      })
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

  it('rejeita companyId forjado na query de pendencias documentais', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .get('/dashboard/document-pendencies?companyId=tenant-forjado')
      .expect(400);

    expect(dashboardService.getDocumentPendencies).not.toHaveBeenCalled();
  });

  it('rejeita company_id forjado na query de pendencias documentais', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .get('/dashboard/document-pendencies?company_id=tenant-forjado')
      .expect(400);

    expect(dashboardService.getDocumentPendencies).not.toHaveBeenCalled();
  });

  it('encaminha filtros validos sem aceitar tenant controlado pelo cliente', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .get(
        '/dashboard/document-pendencies?page=2&limit=15&siteId=11111111-1111-4111-8111-111111111111&module=APR&criticality=high',
      )
      .expect(200);

    expect(dashboardService.getDocumentPendencies).toHaveBeenCalledWith({
      companyId: 'tenant-auth',
      userId: 'user-1',
      isSuperAdmin: false,
      permissions: ['can_view_dashboard'],
      filters: {
        siteId: '11111111-1111-4111-8111-111111111111',
        module: 'APR',
        priority: undefined,
        criticality: 'high',
        status: undefined,
        dateFrom: undefined,
        dateTo: undefined,
        page: 2,
        limit: 15,
      },
    });
    expect(
      dashboardService.getDocumentPendencies.mock.calls[0][0].filters,
    ).not.toHaveProperty('companyId');
  });

  it('rejeita limit fora do teto permitido', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .get('/dashboard/document-pendencies?limit=500')
      .expect(400);

    expect(dashboardService.getDocumentPendencies).not.toHaveBeenCalled();
  });

  it('rejeita siteId invalido antes de consultar o service', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .get('/dashboard/document-pendencies?siteId=site-invalido')
      .expect(400);

    expect(dashboardService.getDocumentPendencies).not.toHaveBeenCalled();
  });
});
