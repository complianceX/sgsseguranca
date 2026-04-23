import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RolesGuard } from '../auth/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { TenantService } from '../common/tenant/tenant.service';
import { AuditsController } from './audits.controller';
import { AuditsService } from './audits.service';

describe('AuditsController (http)', () => {
  let app: INestApplication;

  const auditsService = {
    findPaginated: jest.fn(),
    listStoredFiles: jest.fn(),
    getWeeklyBundle: jest.fn(),
  };
  const tenantService = {
    getTenantId: jest.fn(() => 'company-1'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    tenantService.getTenantId.mockReturnValue('company-1');
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuditsController],
      providers: [
        { provide: AuditsService, useValue: auditsService },
        { provide: TenantService, useValue: tenantService },
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

  it('encaminha paginação válida para o service com tenant autenticado', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    auditsService.findPaginated.mockResolvedValue({
      data: [],
      total: 0,
      page: 2,
      limit: 10,
      totalPages: 0,
    });

    await request(httpServer)
      .get('/audits?page=2&limit=10&search=interna')
      .expect(200);

    expect(auditsService.findPaginated).toHaveBeenCalledWith(
      {
        page: 2,
        limit: 10,
        search: 'interna',
      },
      'company-1',
    );
  });

  it('rejeita company_id forjado na query de listagem', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .get('/audits?company_id=tenant-forjado')
      .expect(400);

    expect(auditsService.findPaginated).not.toHaveBeenCalled();
  });

  it('rejeita limit acima do teto na listagem', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer).get('/audits?limit=999').expect(400);

    expect(auditsService.findPaginated).not.toHaveBeenCalled();
  });

  it('encaminha filtros semanais validados para listStoredFiles', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    auditsService.listStoredFiles.mockResolvedValue([]);

    await request(httpServer)
      .get('/audits/files/list?year=2026&week=12')
      .expect(200);

    expect(auditsService.listStoredFiles).toHaveBeenCalledWith({
      companyId: 'company-1',
      year: 2026,
      week: 12,
    });
  });

  it('rejeita week inválida nas rotas de arquivos governados', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer).get('/audits/files/list?week=99').expect(400);

    expect(auditsService.listStoredFiles).not.toHaveBeenCalled();
  });
});
