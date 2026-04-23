import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RolesGuard } from '../auth/roles.guard';
import { TenantGuard } from './guards/tenant.guard';
import { EpisController } from '../epis/epis.controller';
import { EpisService } from '../epis/epis.service';
import { Epi } from '../epis/entities/epi.entity';
import { MachinesController } from '../machines/machines.controller';
import { MachinesService } from '../machines/machines.service';
import { Machine } from '../machines/entities/machine.entity';
import { ToolsController } from '../tools/tools.controller';
import { ToolsService } from '../tools/tools.service';
import { Tool } from '../tools/entities/tool.entity';
import { RisksController } from '../risks/risks.controller';
import { RisksService } from '../risks/risks.service';
import { Risk } from '../risks/entities/risk.entity';
import { RiskHistory } from '../risks/entities/risk-history.entity';

type CatalogServiceMock = {
  findPaginated: jest.Mock;
  findAll: jest.Mock;
  findOne: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  remove: jest.Mock;
  count: jest.Mock;
};

const makeServiceMock = (): CatalogServiceMock => ({
  findPaginated: jest.fn().mockResolvedValue({
    data: [],
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 0,
  }),
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  count: jest.fn(),
});

const makeQueryBuilder = () => ({
  orderBy: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
});

describe('Catalog query hardening', () => {
  describe('controllers', () => {
    let app: INestApplication;
    const services = {
      epis: makeServiceMock(),
      machines: makeServiceMock(),
      tools: makeServiceMock(),
      risks: makeServiceMock(),
    };

    beforeEach(() => {
      Object.values(services).forEach((service) => {
        Object.values(service).forEach((mock) => mock.mockClear());
      });
    });

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        controllers: [
          EpisController,
          MachinesController,
          ToolsController,
          RisksController,
        ],
        providers: [
          { provide: EpisService, useValue: services.epis },
          { provide: MachinesService, useValue: services.machines },
          { provide: ToolsService, useValue: services.tools },
          { provide: RisksService, useValue: services.risks },
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
      await app.close();
    });

    it.each([
      ['/epis', services.epis],
      ['/machines', services.machines],
      ['/tools', services.tools],
      ['/risks', services.risks],
    ])('rejeita company_id forjado em %s', async (path, service) => {
      const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

      await request(httpServer)
        .get(`${path}?company_id=tenant-forjado`)
        .expect(400);

      expect(service.findPaginated).not.toHaveBeenCalled();
    });

    it.each([
      ['/epis', services.epis],
      ['/machines', services.machines],
      ['/tools', services.tools],
      ['/risks', services.risks],
    ])('rejeita limit acima do teto em %s', async (path, service) => {
      const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

      await request(httpServer).get(`${path}?limit=500`).expect(400);

      expect(service.findPaginated).not.toHaveBeenCalled();
    });

    it('encaminha query válida sem campo de tenant controlado pelo client', async () => {
      const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

      await request(httpServer)
        .get('/machines?page=2&limit=15&search=guindaste')
        .expect(200);

      expect(services.machines.findPaginated).toHaveBeenCalledWith({
        page: 2,
        limit: 15,
        search: 'guindaste',
      });
    });
  });

  describe('services', () => {
    const cacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };
    const tenantService = {
      getTenantId: jest.fn(),
    };
    const riskCalculationService = {
      calculateScore: jest.fn(() => 1),
      classifyByScore: jest.fn(() => 'BAIXO'),
    };
    const auditService = {
      log: jest.fn(),
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it.each([
      [
        'EPI',
        () =>
          new EpisService(
            {
              createQueryBuilder: jest.fn(() => makeQueryBuilder()),
            } as unknown as Repository<Epi>,
            cacheManager as never,
            tenantService as never,
          ),
      ],
      [
        'Máquina',
        () =>
          new MachinesService(
            {
              createQueryBuilder: jest.fn(() => makeQueryBuilder()),
            } as unknown as Repository<Machine>,
            cacheManager as never,
            tenantService as never,
          ),
      ],
      [
        'Ferramenta',
        () =>
          new ToolsService(
            {
              createQueryBuilder: jest.fn(() => makeQueryBuilder()),
            } as unknown as Repository<Tool>,
            cacheManager as never,
            tenantService as never,
          ),
      ],
      [
        'Risco',
        () =>
          new RisksService(
            {
              createQueryBuilder: jest.fn(() => makeQueryBuilder()),
            } as unknown as Repository<Risk>,
            {} as Repository<RiskHistory>,
            riskCalculationService as never,
            auditService as never,
            cacheManager as never,
            tenantService as never,
          ),
      ],
    ])(
      'falha fechado sem tenant em %s.findPaginated',
      async (_name, factory) => {
        tenantService.getTenantId.mockReturnValue(undefined);

        await expect(
          factory().findPaginated({ page: 1, limit: 20 }),
        ).rejects.toThrow(BadRequestException);
      },
    );
  });
});
