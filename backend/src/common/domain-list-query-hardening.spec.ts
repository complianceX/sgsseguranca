import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RolesGuard } from '../auth/roles.guard';
import { TenantGuard } from './guards/tenant.guard';
import { TenantInterceptor } from './tenant/tenant.interceptor';
import { TrainingsController } from '../trainings/trainings.controller';
import { TrainingsService } from '../trainings/trainings.service';
import { FileInspectionService } from './security/file-inspection.service';
import { MedicalExamsController } from '../medical-exams/medical-exams.controller';
import { MedicalExamsService } from '../medical-exams/medical-exams.service';
import { ServiceOrdersController } from '../service-orders/service-orders.controller';
import { ServiceOrdersService } from '../service-orders/service-orders.service';

describe('Domain list query hardening', () => {
  let app: INestApplication;
  const trainingsService = {
    findPaginated: jest.fn(),
    findByCursor: jest.fn(),
    findExpiring: jest.fn(),
    dispatchExpiryNotifications: jest.fn(),
  };
  const medicalExamsService = {
    findPaginated: jest.fn(),
    findByCursor: jest.fn(),
  };
  const serviceOrdersService = {
    findPaginated: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    trainingsService.findPaginated.mockResolvedValue({ data: [] });
    trainingsService.findByCursor.mockResolvedValue({ data: [] });
    trainingsService.findExpiring.mockResolvedValue([]);
    trainingsService.dispatchExpiryNotifications.mockResolvedValue({
      dispatched: 0,
    });
    medicalExamsService.findPaginated.mockResolvedValue({ data: [] });
    medicalExamsService.findByCursor.mockResolvedValue({ data: [] });
    serviceOrdersService.findPaginated.mockResolvedValue({ data: [] });
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [
        TrainingsController,
        MedicalExamsController,
        ServiceOrdersController,
      ],
      providers: [
        { provide: TrainingsService, useValue: trainingsService },
        { provide: FileInspectionService, useValue: {} },
        { provide: MedicalExamsService, useValue: medicalExamsService },
        { provide: ServiceOrdersService, useValue: serviceOrdersService },
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

  it.each(['/trainings', '/medical-exams', '/service-orders'])(
    'rejeita company_id forjado em %s',
    async (path) => {
      const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

      await request(httpServer)
        .get(`${path}?company_id=tenant-forjado`)
        .expect(400);

      expect(trainingsService.findPaginated).not.toHaveBeenCalled();
      expect(medicalExamsService.findPaginated).not.toHaveBeenCalled();
      expect(serviceOrdersService.findPaginated).not.toHaveBeenCalled();
    },
  );

  it.each(['/trainings', '/medical-exams', '/service-orders'])(
    'rejeita limit acima do teto em %s',
    async (path) => {
      const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

      await request(httpServer).get(`${path}?limit=500`).expect(400);
    },
  );

  it('encaminha cursor validado para treinamentos', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .get('/trainings?cursor=cursor-1&limit=25')
      .expect(200);

    expect(trainingsService.findByCursor).toHaveBeenCalledWith({
      cursor: 'cursor-1',
      limit: 25,
    });
    expect(trainingsService.findPaginated).not.toHaveBeenCalled();
  });

  it('encaminha days validado no endpoint de vencimento de treinamentos', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .get('/trainings/expiry/expiring?days=30')
      .expect(200);

    expect(trainingsService.findExpiring).toHaveBeenCalledWith(30);
  });

  it('rejeita days acima do teto em treinamentos', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .post('/trainings/expiry/notify?days=9999')
      .expect(400);

    expect(trainingsService.dispatchExpiryNotifications).not.toHaveBeenCalled();
  });

  it('rejeita filtros médicos fora do enum', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer).get('/medical-exams?resultado=root').expect(400);

    expect(medicalExamsService.findPaginated).not.toHaveBeenCalled();
  });

  it('encaminha filtros válidos de ordem de serviço', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const siteId = '11111111-1111-4111-8111-111111111111';

    await request(httpServer)
      .get(`/service-orders?page=2&limit=15&status=ativo&site_id=${siteId}`)
      .expect(200);

    expect(serviceOrdersService.findPaginated).toHaveBeenCalledWith({
      page: 2,
      limit: 15,
      status: 'ativo',
      site_id: siteId,
    });
  });
});
