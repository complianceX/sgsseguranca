import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { getRepositoryToken } from '@nestjs/typeorm';
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
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { DashboardPendingQueueService } from './dashboard-pending-queue.service';
import { DashboardDocumentPendenciesService } from './dashboard-document-pendencies.service';
import { DashboardDocumentPendencyOperationsService } from './dashboard-document-pendency-operations.service';
import { DashboardOperationalNotifierService } from './dashboard-operational-notifier.service';

type DashboardSummarySmokeShape = {
  counts: {
    users: number;
    companies: number;
    sites: number;
    checklists: number;
    aprs: number;
    pts: number;
  };
  pendingApprovals: {
    aprs: number;
    pts: number;
    checklists: number;
    nonconformities: number;
  };
  recentActivities: unknown[];
  siteCompliance: unknown[];
  expiringEpis: unknown[];
  expiringTrainings: unknown[];
};

describe('DashboardOptimization (Smoke Test)', () => {
  let service: DashboardService;
  let cacheManager: { get: jest.Mock; set: jest.Mock; del: jest.Mock };

  beforeEach(async () => {
    const queryBuilder = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getCount: jest.fn().mockResolvedValue(0),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    const mockRepo = {
      query: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn(() => queryBuilder),
    };
    cacheManager = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: getRepositoryToken(Apr), useValue: mockRepo },
        { provide: getRepositoryToken(Audit), useValue: mockRepo },
        { provide: getRepositoryToken(Checklist), useValue: mockRepo },
        { provide: getRepositoryToken(Company), useValue: mockRepo },
        { provide: getRepositoryToken(Dds), useValue: mockRepo },
        { provide: getRepositoryToken(Epi), useValue: mockRepo },
        { provide: getRepositoryToken(Inspection), useValue: mockRepo },
        { provide: getRepositoryToken(Training), useValue: mockRepo },
        { provide: getRepositoryToken(NonConformity), useValue: mockRepo },
        { provide: getRepositoryToken(Cat), useValue: mockRepo },
        { provide: getRepositoryToken(Pt), useValue: mockRepo },
        { provide: getRepositoryToken(Report), useValue: mockRepo },
        { provide: getRepositoryToken(Site), useValue: mockRepo },
        { provide: getRepositoryToken(User), useValue: mockRepo },
        { provide: getRepositoryToken(MonthlySnapshot), useValue: mockRepo },
        { provide: getRepositoryToken(Notification), useValue: mockRepo },
        { provide: getRepositoryToken(MedicalExam), useValue: mockRepo },
        { provide: CACHE_MANAGER, useValue: cacheManager },
        {
          provide: 'BullQueue_dashboard-revalidate',
          useValue: { add: jest.fn() },
        },
        { provide: DashboardPendingQueueService, useValue: {} },
        { provide: DashboardDocumentPendenciesService, useValue: {} },
        { provide: DashboardDocumentPendencyOperationsService, useValue: {} },
        { provide: DashboardOperationalNotifierService, useValue: {} },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  it('deve retornar o payload consolidado do summary sem quebrar a estrutura do frontend', async () => {
    const result = await service.getSummary('company-123', {
      bypassCache: true,
    });
    const summary = result as DashboardSummarySmokeShape;

    expect(summary).toBeDefined();
    expect(summary.counts).toMatchObject({
      users: 0,
      companies: 0,
      sites: 0,
      checklists: 0,
      aprs: 0,
      pts: 0,
    });
    expect(summary.pendingApprovals).toMatchObject({
      aprs: 0,
      pts: 0,
      checklists: 0,
      nonconformities: 0,
    });
    expect(summary.recentActivities).toEqual([]);
    expect(summary.siteCompliance).toEqual([]);
    expect(summary.expiringEpis).toEqual([]);
    expect(summary.expiringTrainings).toEqual([]);
    expect(cacheManager.set).toHaveBeenCalled();
  });
});
