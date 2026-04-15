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
import { DashboardPendingQueueService } from './dashboard-pending-queue.service';
import { DashboardDocumentPendenciesService } from './dashboard-document-pendencies.service';
import { DashboardDocumentPendencyOperationsService } from './dashboard-document-pendency-operations.service';
import { DashboardOperationalNotifierService } from './dashboard-operational-notifier.service';
import { DashboardQuerySnapshotService } from './dashboard-query-snapshot.service';
import { RedisService } from '../common/redis/redis.service';
import { TenantService } from '../common/tenant/tenant.service';

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

describe('DashboardOptimization (Smoke Test)', () => {
  let service: DashboardService;
  let redisClient: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let redisService: { getClient: jest.Mock };
  let aprRepo: MockRepo;
  let ptRepo: MockRepo;
  let inspectionRepo: MockRepo;
  let auditRepo: MockRepo;
  let nonConformityRepo: MockRepo;
  let trainingRepo: MockRepo;
  let medicalExamRepo: MockRepo;

  const createMockRepo = (): MockRepo => {
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
  };

  beforeEach(async () => {
    const mockRepo = createMockRepo();
    aprRepo = createMockRepo();
    ptRepo = createMockRepo();
    inspectionRepo = createMockRepo();
    auditRepo = createMockRepo();
    nonConformityRepo = createMockRepo();
    trainingRepo = createMockRepo();
    medicalExamRepo = createMockRepo();
    redisClient = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };
    redisService = {
      getClient: jest.fn(() => redisClient),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: getRepositoryToken(Apr), useValue: aprRepo },
        { provide: getRepositoryToken(Audit), useValue: auditRepo },
        { provide: getRepositoryToken(Checklist), useValue: mockRepo },
        { provide: getRepositoryToken(Company), useValue: mockRepo },
        { provide: getRepositoryToken(Dds), useValue: mockRepo },
        { provide: getRepositoryToken(Epi), useValue: mockRepo },
        { provide: getRepositoryToken(Inspection), useValue: inspectionRepo },
        { provide: getRepositoryToken(Training), useValue: trainingRepo },
        {
          provide: getRepositoryToken(NonConformity),
          useValue: nonConformityRepo,
        },
        { provide: getRepositoryToken(Cat), useValue: mockRepo },
        { provide: getRepositoryToken(Pt), useValue: ptRepo },
        { provide: getRepositoryToken(Report), useValue: mockRepo },
        { provide: getRepositoryToken(Site), useValue: mockRepo },
        { provide: getRepositoryToken(User), useValue: mockRepo },
        { provide: getRepositoryToken(MonthlySnapshot), useValue: mockRepo },
        { provide: getRepositoryToken(Notification), useValue: mockRepo },
        { provide: getRepositoryToken(MedicalExam), useValue: medicalExamRepo },
        { provide: RedisService, useValue: redisService },
        {
          provide: 'BullQueue_dashboard-revalidate',
          useValue: { add: jest.fn() },
        },
        { provide: DashboardPendingQueueService, useValue: {} },
        {
          provide: DashboardQuerySnapshotService,
          useValue: {
            read: jest.fn().mockResolvedValue({ hit: false, stale: false }),
            upsert: jest.fn().mockResolvedValue(undefined),
            invalidate: jest.fn().mockResolvedValue(undefined),
            recordFailure: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: DashboardDocumentPendenciesService, useValue: {} },
        { provide: DashboardDocumentPendencyOperationsService, useValue: {} },
        { provide: DashboardOperationalNotifierService, useValue: {} },
        {
          provide: TenantService,
          useValue: {
            getContext: jest.fn().mockReturnValue({
              companyId: 'company-123',
              isSuperAdmin: false,
              siteScope: 'all',
            }),
            getTenantId: jest.fn().mockReturnValue('company-123'),
            isSuperAdmin: jest.fn().mockReturnValue(false),
          },
        },
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
    expect(inspectionRepo.find).toHaveBeenCalledTimes(2);
    expect(auditRepo.find).toHaveBeenCalledTimes(2);
    expect(nonConformityRepo.find).toHaveBeenCalledTimes(2);
    expect(redisClient.set).toHaveBeenCalled();
  });

  it('deve calcular KPIs sem carregar listas completas de APR e treinamentos', async () => {
    aprRepo.count.mockResolvedValueOnce(8);
    aprRepo.queryBuilder.getCount.mockResolvedValueOnce(5);
    inspectionRepo.find.mockResolvedValueOnce([
      {
        id: 'inspection-1',
        plano_acao: [{ status: 'Concluída' }],
      },
    ]);
    trainingRepo.count.mockResolvedValueOnce(10);
    trainingRepo.queryBuilder.getCount.mockResolvedValueOnce(7);
    nonConformityRepo.queryBuilder.getRawMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await service.getKpis('company-123');

    expect(result.leading.apr_before_task).toMatchObject({
      total: 8,
      compliant: 5,
      percentage: 62.5,
    });
    expect(result.leading.training_compliance).toMatchObject({
      total: 10,
      compliant: 7,
      percentage: 70,
    });
    expect(aprRepo.find).not.toHaveBeenCalled();
    expect(trainingRepo.find).not.toHaveBeenCalled();
  });

  it('deve montar TST Day com selects leves e sem query builders para exames e treinamentos', async () => {
    ptRepo.find.mockResolvedValueOnce([
      {
        id: 'pt-1',
        numero: 'PT-001',
        titulo: 'PT teste',
        status: 'Pendente',
        residual_risk: 'HIGH',
        site: { nome: 'Obra 1' },
        responsavel: { nome: 'Responsavel 1' },
      },
    ]);
    nonConformityRepo.find.mockResolvedValueOnce([
      {
        id: 'nc-1',
        codigo_nc: 'NC-001',
        status: 'Aberta',
        risco_nivel: 'Alto',
        local_setor_area: 'Area 1',
        site: { nome: 'Obra 1' },
      },
    ]);
    inspectionRepo.find.mockResolvedValueOnce([
      {
        id: 'inspection-1',
        setor_area: 'Area 1',
        data_inspecao: '2026-04-01',
        plano_acao: [{ prazo: '2026-04-01', status: 'Pendente' }],
        site: { nome: 'Obra 1' },
        responsavel: { nome: 'Responsavel 1' },
      },
    ]);
    medicalExamRepo.find.mockResolvedValueOnce([
      {
        id: 'exam-1',
        tipo_exame: 'periodico',
        data_vencimento: '2026-04-14',
        resultado: 'apto',
        user: { nome: 'Funcionario 1' },
      },
    ]);
    trainingRepo.find.mockResolvedValueOnce([
      {
        id: 'training-1',
        nome: 'NR-35',
        data_vencimento: '2026-04-15',
        bloqueia_operacao_quando_vencido: true,
        user: { nome: 'Funcionario 1' },
      },
    ]);

    const result = await service.getTstDay('company-123');

    expect(result.summary).toMatchObject({
      pendingPtApprovals: 1,
      criticalNonConformities: 1,
      overdueInspections: 1,
      expiringDocuments: 2,
    });
    expect(ptRepo.find).toHaveBeenCalledTimes(1);
    expect(medicalExamRepo.find).toHaveBeenCalledTimes(1);
    expect(trainingRepo.find).toHaveBeenCalledTimes(1);
    expect(medicalExamRepo.queryBuilder.getMany).not.toHaveBeenCalled();
    expect(trainingRepo.queryBuilder.getMany).not.toHaveBeenCalled();
  });
});
