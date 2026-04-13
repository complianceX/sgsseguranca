import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
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
import { Inspection } from '../inspections/entities/inspection.entity';
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
  let cacheManager: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let snapshotService: {
    read: jest.Mock;
    upsert: jest.Mock;
    invalidate: jest.Mock;
    recordFailure: jest.Mock;
  };
  let pendingQueueService: { getPendingQueue: jest.Mock };

  beforeEach(async () => {
    const mockRepo = createMockRepo();
    cacheManager = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: getRepositoryToken(Apr), useValue: createMockRepo() },
        { provide: getRepositoryToken(Audit), useValue: createMockRepo() },
        { provide: getRepositoryToken(Checklist), useValue: createMockRepo() },
        { provide: getRepositoryToken(Company), useValue: mockRepo },
        { provide: getRepositoryToken(Dds), useValue: createMockRepo() },
        { provide: getRepositoryToken(Epi), useValue: createMockRepo() },
        { provide: getRepositoryToken(Inspection), useValue: createMockRepo() },
        { provide: getRepositoryToken(Training), useValue: createMockRepo() },
        {
          provide: getRepositoryToken(NonConformity),
          useValue: createMockRepo(),
        },
        { provide: getRepositoryToken(Cat), useValue: createMockRepo() },
        { provide: getRepositoryToken(Pt), useValue: createMockRepo() },
        { provide: getRepositoryToken(Report), useValue: createMockRepo() },
        { provide: getRepositoryToken(Site), useValue: createMockRepo() },
        { provide: getRepositoryToken(User), useValue: createMockRepo() },
        { provide: getRepositoryToken(MonthlySnapshot), useValue: createMockRepo() },
        { provide: getRepositoryToken(Notification), useValue: createMockRepo() },
        { provide: getRepositoryToken(MedicalExam), useValue: createMockRepo() },
        { provide: CACHE_MANAGER, useValue: cacheManager },
        {
          provide: 'BullQueue_dashboard-revalidate',
          useValue: { add: jest.fn() },
        },
        { provide: DashboardPendingQueueService, useValue: pendingQueueService },
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
      ],
    }).compile();

    service = module.get(DashboardService);
  });

  it('serve KPIs do snapshot persistido e reaquece o Redis', async () => {
    snapshotService.read.mockResolvedValueOnce({
      hit: true,
      stale: false,
      generatedAt: Date.parse('2026-04-12T10:00:00.000Z'),
      value: {
        leading: {
          apr_before_task: { total: 1, compliant: 1, percentage: 100 },
          completed_inspections: { total: 1, completed: 1, percentage: 100 },
          training_compliance: { total: 1, compliant: 1, percentage: 100 },
        },
        lagging: {
          recurring_nc: 0,
          incidents: 0,
          blocked_pt: 0,
        },
        trends: {
          risk: [],
          nc: [],
        },
        alerts: [],
      },
    });

    const result = await service.getKpis('company-1');

    expect(result.meta).toMatchObject({
      source: 'snapshot',
      stale: false,
    });
    expect(result.leading.apr_before_task.percentage).toBe(100);
    expect(cacheManager.set).toHaveBeenCalled();
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
});
