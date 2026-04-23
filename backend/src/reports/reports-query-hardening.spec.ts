import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RolesGuard } from '../auth/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

describe('ReportsController query hardening', () => {
  let app: INestApplication;
  const pdfQueue = {
    add: jest.fn(),
    getJobs: jest.fn(),
    getJob: jest.fn(),
  };
  const reportsService = {
    findPaginated: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    pdfQueue.add.mockResolvedValue({ id: 'job-1' });
    pdfQueue.getJobs.mockResolvedValue([]);
    reportsService.findPaginated.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 12,
      totalPages: 0,
    });
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [
        { provide: getQueueToken('pdf-generation'), useValue: pdfQueue },
        { provide: ReportsService, useValue: reportsService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest<{
            user?: { company_id: string; userId: string };
          }>();
          req.user = { company_id: 'company-1', userId: 'user-1' };
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
        intercept: (_context: unknown, next: { handle: () => unknown }) =>
          next.handle(),
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

  it('rejeita pagina inválida na listagem de relatórios', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer).get('/reports?page=0').expect(400);

    expect(reportsService.findPaginated).not.toHaveBeenCalled();
  });

  it('rejeita mês inválido antes de enfileirar relatório mensal', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .get('/reports/monthly?year=2026&month=13')
      .expect(400);

    expect(pdfQueue.add).not.toHaveBeenCalled();
  });

  it('rejeita ano fora do range antes de enfileirar relatório mensal', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .get('/reports/monthly?year=3026&month=3')
      .expect(400);

    expect(pdfQueue.add).not.toHaveBeenCalled();
  });

  it('enfileira relatório mensal válido usando tenant autenticado', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .get('/reports/monthly?year=2026&month=3')
      .expect(200);

    expect(pdfQueue.add).toHaveBeenCalledWith(
      'generate',
      expect.objectContaining({
        companyId: 'company-1',
        userId: 'user-1',
        params: { companyId: 'company-1', year: 2026, month: 3 },
      }),
      expect.any(Object),
    );
  });

  it('rejeita limit acima do teto na listagem de jobs', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer).get('/reports/jobs?limit=999').expect(400);

    expect(pdfQueue.getJobs).not.toHaveBeenCalled();
  });
});
