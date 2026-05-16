import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DashboardService } from './dashboard.service';
import { DashboardQuerySnapshotService } from './dashboard-query-snapshot.service';
import { DashboardPendingQueueService } from './dashboard-pending-queue.service';
import { DashboardDocumentPendenciesService } from './dashboard-document-pendencies.service';
import { DashboardDocumentPendencyOperationsService } from './dashboard-document-pendency-operations.service';
import { DashboardOperationalNotifierService } from './dashboard-operational-notifier.service';
import { Apr } from '../aprs/entities/apr.entity';
import { Audit } from '../audits/entities/audit.entity';
import { Checklist } from '../checklists/entities/checklist.entity';
import { Company } from '../companies/entities/company.entity';
import { Dds } from '../dds/entities/dds.entity';
import { Epi } from '../epis/entities/epi.entity';
import { Inspection } from '../common/entities/inspection.entity';
import { Training } from '../trainings/entities/training.entity';
import { NonConformity } from '../nonconformities/entities/nonconformity.entity';
import { Cat } from '../cats/entities/cat.entity';
import { Pt } from '../pts/entities/pt.entity';
import { Report } from '../reports/entities/report.entity';
import { Site } from '../sites/entities/site.entity';
import { User } from '../users/entities/user.entity';
import { MonthlySnapshot } from './entities/monthly-snapshot.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { MedicalExam } from '../medical-exams/entities/medical-exam.entity';
import { RedisService } from '../common/redis/redis.service';
import { TenantService } from '../common/tenant/tenant.service';

type MockRepo = {
  query: jest.Mock;
  count: jest.Mock;
  find: jest.Mock;
  createQueryBuilder: jest.Mock;
  queryBuilder: {
    select: jest.Mock;
    addSelect: jest.Mock;
    leftJoin: jest.Mock;
    innerJoin: jest.Mock;
    leftJoinAndSelect: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    groupBy: jest.Mock;
    having: jest.Mock;
    addGroupBy: jest.Mock;
    orderBy: jest.Mock;
    limit: jest.Mock;
    take: jest.Mock;
    getMany: jest.Mock;
    getCount: jest.Mock;
    getRawMany: jest.Mock;
  };
};

function createMockRepo(): MockRepo {
  const queryBuilder = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    having: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
    getCount: jest.fn().mockResolvedValue(0),
    getRawMany: jest.fn().mockResolvedValue([]),
  };

  return {
    query: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    find: jest.fn().mockResolvedValue([]),
    createQueryBuilder: jest.fn(() => queryBuilder),
    queryBuilder,
  };
}

describe('Dashboard cache orchestration', () => {
  let service: DashboardService;
  let aprsRepo: MockRepo;
  let trainingsRepo: MockRepo;
  let redisClient: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    eval: jest.Mock;
  };
  let redisService: { getClient: jest.Mock };
  let snapshotService: {
    read: jest.Mock;
    upsert: jest.Mock;
    invalidate: jest.Mock;
    recordFailure: jest.Mock;
  };
  let pendingQueueService: { getPendingQueue: jest.Mock };
  let tenantService: {
    getContext: jest.Mock;
    getTenantId: jest.Mock;
    isSuperAdmin: jest.Mock;
  };

  beforeEach(async () => {
    const mockRepo = createMockRepo();
    aprsRepo = createMockRepo();
    trainingsRepo = createMockRepo();
    redisClient = {
      get: jest.fn().mockResolvedValue(undefined),
      // SET NX PX returns 'OK' on successful acquisition (real Redis behavior).
      // The dashboard distributed-lock code reads `result === 'OK'` to decide
      // ownership; mocking this accurately keeps the inflight loader on the
      // happy path instead of falling into the 3s wait-for-cache window.
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(undefined),
      // releaseDashboardLock uses Lua eval; return 1 (deleted) to mirror the
      // real path. Tests don't assert on this value but the mock must exist.
      eval: jest.fn().mockResolvedValue(1),
    };
    redisService = {
      getClient: jest.fn(() => redisClient),
    };
    snapshotService = {
      read: jest.fn().mockResolvedValue({ hit: false, stale: false }),
      upsert: jest.fn().mockResolvedValue(undefined),
      invalidate: jest.fn().mockResolvedValue(undefined),
      recordFailure: jest.fn().mockResolvedValue(undefined),
    };
    pendingQueueService = {
      getPendingQueue: jest.fn(),
    };
    tenantService = {
      getContext: jest.fn().mockReturnValue({
        companyId: 'company-1',
        isSuperAdmin: false,
        siteScope: 'all',
      }),
      getTenantId: jest.fn().mockReturnValue('company-1'),
      isSuperAdmin: jest.fn().mockReturnValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: getRepositoryToken(Apr), useValue: aprsRepo },
        { provide: getRepositoryToken(Audit), useValue: createMockRepo() },
        { provide: getRepositoryToken(Checklist), useValue: createMockRepo() },
        { provide: getRepositoryToken(Company), useValue: mockRepo },
        { provide: getRepositoryToken(Dds), useValue: createMockRepo() },
        { provide: getRepositoryToken(Epi), useValue: createMockRepo() },
        { provide: getRepositoryToken(Inspection), useValue: createMockRepo() },
        { provide: getRepositoryToken(Training), useValue: trainingsRepo },
        {
          provide: getRepositoryToken(NonConformity),
          useValue: createMockRepo(),
        },
        { provide: getRepositoryToken(Cat), useValue: createMockRepo() },
        { provide: getRepositoryToken(Pt), useValue: createMockRepo() },
        { provide: getRepositoryToken(Report), useValue: createMockRepo() },
        { provide: getRepositoryToken(Site), useValue: createMockRepo() },
        { provide: getRepositoryToken(User), useValue: createMockRepo() },
        {
          provide: getRepositoryToken(MonthlySnapshot),
          useValue: createMockRepo(),
        },
        {
          provide: getRepositoryToken(Notification),
          useValue: createMockRepo(),
        },
        {
          provide: getRepositoryToken(MedicalExam),
          useValue: createMockRepo(),
        },
        { provide: RedisService, useValue: redisService },
        {
          provide: 'BullQueue_dashboard-revalidate',
          useValue: { add: jest.fn() },
        },
        {
          provide: DashboardPendingQueueService,
          useValue: pendingQueueService,
        },
        { provide: DashboardQuerySnapshotService, useValue: snapshotService },
        { provide: DashboardDocumentPendenciesService, useValue: {} },
        { provide: DashboardDocumentPendencyOperationsService, useValue: {} },
        {
          provide: DashboardOperationalNotifierService,
          useValue: {
            notifyPendingQueue: jest.fn().mockResolvedValue(undefined),
            notifyDocumentPendencies: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: TenantService,
          useValue: tenantService,
        },
      ],
    }).compile();

    service = module.get(DashboardService);
  });

  it('getKpis usa cache e persiste snapshot no primeiro build', async () => {
    const result = await service.getKpis('company-1');

    expect(result.meta).toMatchObject({
      source: 'live',
      stale: false,
    });
    expect(snapshotService.read).toHaveBeenCalledWith('company-1', 'kpis');
    expect(snapshotService.upsert).toHaveBeenCalledTimes(1);
    expect(aprsRepo.count).toHaveBeenCalled();
    expect(trainingsRepo.count).toHaveBeenCalled();
  });

  it('getKpis devolve snapshot quando o cache já está quente', async () => {
    snapshotService.read.mockResolvedValueOnce({
      hit: true,
      stale: false,
      generatedAt: Date.now() - 1_000,
      value: {
        leading: {
          apr_before_task: {
            total: 3,
          },
        },
      },
    });

    const result = await service.getKpis('company-1');

    expect(result).toMatchObject({
      leading: {
        apr_before_task: {
          total: 3,
        },
      },
      meta: {
        source: 'snapshot',
        stale: false,
      },
    });
    expect(snapshotService.upsert).not.toHaveBeenCalled();
    expect(aprsRepo.count).not.toHaveBeenCalled();
    expect(trainingsRepo.count).not.toHaveBeenCalled();
  });

  it('revalidateDashboardQuery para kpis ignora cache e força rebuild', async () => {
    snapshotService.read.mockResolvedValueOnce({
      hit: true,
      stale: false,
      generatedAt: Date.now() - 1_000,
      value: {
        leading: {
          apr_before_task: {
            total: 9,
          },
        },
      },
    });

    await service.revalidateDashboardQuery('company-1', 'kpis');

    expect(snapshotService.read).not.toHaveBeenCalled();
    expect(snapshotService.upsert).toHaveBeenCalled();
    expect(aprsRepo.count).toHaveBeenCalled();
    expect(trainingsRepo.count).toHaveBeenCalled();
  });

  it('deduplica rebuild concorrente da pending queue por tenant/query', async () => {
    let resolveQueue: ((value: unknown) => void) | undefined;
    pendingQueueService.getPendingQueue.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveQueue = resolve;
        }),
    );

    const promiseA = service.getPendingQueue({
      companyId: 'company-1',
      skipNotifications: true,
    });
    const promiseB = service.getPendingQueue({
      companyId: 'company-1',
      skipNotifications: true,
    });

    await new Promise((resolve) => setImmediate(resolve));

    expect(pendingQueueService.getPendingQueue).toHaveBeenCalledTimes(1);

    resolveQueue?.({
      degraded: false,
      failedSources: [],
      summary: {
        total: 1,
        critical: 1,
        high: 0,
        medium: 0,
        documents: 1,
        health: 0,
        actions: 0,
        slaBreached: 0,
        slaDueToday: 0,
        slaDueSoon: 0,
      },
      items: [],
    });

    const [resultA, resultB] = await Promise.all([promiseA, promiseB]);

    expect(resultA.meta?.source).toBe('live');
    expect(resultB.meta?.source).toBe('live');
    expect(snapshotService.upsert).toHaveBeenCalledTimes(1);
  });

  it('continua com payload live quando leitura de snapshot falha', async () => {
    snapshotService.read.mockRejectedValueOnce(
      new Error('permission denied for table dashboard_query_snapshots'),
    );
    pendingQueueService.getPendingQueue.mockResolvedValueOnce({
      degraded: false,
      failedSources: [],
      summary: {
        total: 0,
        critical: 0,
        high: 0,
        medium: 0,
        documents: 0,
        health: 0,
        actions: 0,
        slaBreached: 0,
        slaDueToday: 0,
        slaDueSoon: 0,
      },
      items: [],
    });

    const result = await service.getPendingQueue({
      companyId: 'company-1',
      skipNotifications: true,
    });

    expect(result.meta?.source).toBe('live');
    expect(pendingQueueService.getPendingQueue).toHaveBeenCalledTimes(1);
  });

  it('nao derruba a resposta live quando gravacao de snapshot falha', async () => {
    snapshotService.upsert.mockRejectedValueOnce(
      new Error('permission denied for table dashboard_query_snapshots'),
    );
    pendingQueueService.getPendingQueue.mockResolvedValueOnce({
      degraded: false,
      failedSources: [],
      summary: {
        total: 0,
        critical: 0,
        high: 0,
        medium: 0,
        documents: 0,
        health: 0,
        actions: 0,
        slaBreached: 0,
        slaDueToday: 0,
        slaDueSoon: 0,
      },
      items: [],
    });

    const result = await service.getPendingQueue({
      companyId: 'company-1',
      skipNotifications: true,
    });

    expect(result.meta?.source).toBe('live');
    expect(snapshotService.upsert).toHaveBeenCalledTimes(1);
  });

  it('nao usa cache compartilhado para usuario site-scoped sem obra atribuida', async () => {
    tenantService.getContext.mockReturnValueOnce({
      companyId: 'company-1',
      isSuperAdmin: false,
      siteScope: 'single',
      siteId: undefined,
    });

    const result = await service.getPendingQueue({
      companyId: 'company-1',
      skipNotifications: true,
    });

    expect(result.degraded).toBe(true);
    expect(result.failedSources).toContain('site-scope');
    expect(result.items).toHaveLength(0);
    expect(redisClient.get).not.toHaveBeenCalled();
    expect(snapshotService.read).not.toHaveBeenCalled();
    expect(snapshotService.upsert).not.toHaveBeenCalled();
    expect(pendingQueueService.getPendingQueue).not.toHaveBeenCalled();
  });

  it('summary site-scoped sem obra retorna vazio sem gravar snapshot de empresa', async () => {
    tenantService.getContext.mockReturnValueOnce({
      companyId: 'company-1',
      isSuperAdmin: false,
      siteScope: 'single',
      siteId: undefined,
    });

    const result = await service.getSummary('company-1');

    expect(result.counts).toMatchObject({
      users: 0,
      companies: 0,
      sites: 0,
    });
    expect(result.meta?.source).toBe('live');
    expect(redisClient.get).not.toHaveBeenCalled();
    expect(snapshotService.read).not.toHaveBeenCalled();
    expect(snapshotService.upsert).not.toHaveBeenCalled();
  });
});
