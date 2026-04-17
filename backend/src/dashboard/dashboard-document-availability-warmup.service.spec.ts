import { Repository } from 'typeorm';
import { UserSession } from '../auth/entities/user-session.entity';
import { Company } from '../companies/entities/company.entity';
import { DashboardDocumentAvailabilitySnapshotService } from './dashboard-document-availability-snapshot.service';
import { DashboardDocumentAvailabilityWarmupService } from './dashboard-document-availability-warmup.service';
import { DashboardDocumentPendenciesService } from './dashboard-document-pendencies.service';

describe('DashboardDocumentAvailabilityWarmupService', () => {
  let service: DashboardDocumentAvailabilityWarmupService;
  let userSessionRepository: jest.Mocked<Repository<UserSession>>;
  let companiesRepository: jest.Mocked<Repository<Company>>;
  let snapshotService: Pick<
    DashboardDocumentAvailabilitySnapshotService,
    'ensureSnapshotsAvailable'
  >;
  let documentPendenciesService: Pick<
    DashboardDocumentPendenciesService,
    'warmPreparedBaseCache'
  >;
  const originalConcurrency =
    process.env.DASHBOARD_DOCUMENT_AVAILABILITY_WARMUP_CONCURRENCY;
  const originalLimit =
    process.env.DASHBOARD_DOCUMENT_AVAILABILITY_WARMUP_COMPANY_LIMIT;
  const originalDelay =
    process.env.DASHBOARD_DOCUMENT_AVAILABILITY_WARMUP_DELAY_MS;

  beforeEach(() => {
    process.env.DASHBOARD_DOCUMENT_AVAILABILITY_WARMUP_CONCURRENCY = '1';
    process.env.DASHBOARD_DOCUMENT_AVAILABILITY_WARMUP_COMPANY_LIMIT = '3';

    userSessionRepository = {
      find: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<Repository<UserSession>>;
    companiesRepository = {
      find: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<Repository<Company>>;
    snapshotService = {
      ensureSnapshotsAvailable: jest.fn().mockResolvedValue(undefined),
    };
    documentPendenciesService = {
      warmPreparedBaseCache: jest.fn().mockResolvedValue(undefined),
    };

    service = new DashboardDocumentAvailabilityWarmupService(
      userSessionRepository,
      companiesRepository,
      snapshotService as DashboardDocumentAvailabilitySnapshotService,
      documentPendenciesService as DashboardDocumentPendenciesService,
    );
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
    process.env.DASHBOARD_DOCUMENT_AVAILABILITY_WARMUP_CONCURRENCY =
      originalConcurrency;
    process.env.DASHBOARD_DOCUMENT_AVAILABILITY_WARMUP_COMPANY_LIMIT =
      originalLimit;
    process.env.DASHBOARD_DOCUMENT_AVAILABILITY_WARMUP_DELAY_MS = originalDelay;
  });

  it('primeCompanies deduplica empresas válidas', async () => {
    await service.primeCompanies([
      '550e8400-e29b-41d4-a716-446655440001',
      '550e8400-e29b-41d4-a716-446655440001',
      'invalid-company',
      '550e8400-e29b-41d4-a716-446655440002',
    ]);

    expect(snapshotService.ensureSnapshotsAvailable).toHaveBeenCalledTimes(2);
    expect(
      documentPendenciesService.warmPreparedBaseCache,
    ).toHaveBeenCalledTimes(2);
  });

  it('prioriza empresas com sessão ativa e completa com empresas recentes', async () => {
    userSessionRepository.find.mockResolvedValue([
      {
        company_id: '550e8400-e29b-41d4-a716-446655440010',
        last_active: new Date('2026-04-13T10:00:00.000Z'),
      } as UserSession,
      {
        company_id: '550e8400-e29b-41d4-a716-446655440011',
        last_active: new Date('2026-04-13T09:00:00.000Z'),
      } as UserSession,
    ]);
    companiesRepository.find.mockResolvedValue([
      { id: '550e8400-e29b-41d4-a716-446655440011' } as Company,
      { id: '550e8400-e29b-41d4-a716-446655440012' } as Company,
      { id: '550e8400-e29b-41d4-a716-446655440013' } as Company,
    ]);

    await service.warm();

    const mockedUserSessionRepository = userSessionRepository as unknown as {
      find: jest.Mock;
    };
    const mockedCompaniesRepository = companiesRepository as unknown as {
      find: jest.Mock;
    };
    const findUserSessionsMock = mockedUserSessionRepository.find;
    const findCompaniesMock = mockedCompaniesRepository.find;
    expect(findUserSessionsMock).toHaveBeenCalledTimes(1);
    expect(findCompaniesMock).toHaveBeenCalledTimes(1);
    expect(snapshotService.ensureSnapshotsAvailable).toHaveBeenNthCalledWith(
      1,
      {
        companyId: '550e8400-e29b-41d4-a716-446655440010',
        shouldCollect: true,
      },
    );
    expect(snapshotService.ensureSnapshotsAvailable).toHaveBeenNthCalledWith(
      2,
      {
        companyId: '550e8400-e29b-41d4-a716-446655440011',
        shouldCollect: true,
      },
    );
    expect(snapshotService.ensureSnapshotsAvailable).toHaveBeenNthCalledWith(
      3,
      {
        companyId: '550e8400-e29b-41d4-a716-446655440012',
        shouldCollect: true,
      },
    );
  });

  it('deduplica execuções concorrentes do warmup', async () => {
    userSessionRepository.find.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve([
                {
                  company_id: '550e8400-e29b-41d4-a716-446655440020',
                  last_active: new Date(),
                } as UserSession,
              ]),
            20,
          ),
        ),
    );

    await Promise.all([service.warm(), service.warm(), service.warm()]);

    const mockedUserSessionRepository = userSessionRepository as unknown as {
      find: jest.Mock;
    };
    const findUserSessionsMock = mockedUserSessionRepository.find;
    expect(findUserSessionsMock).toHaveBeenCalledTimes(1);
    expect(snapshotService.ensureSnapshotsAvailable).toHaveBeenCalledTimes(1);
  });

  it('cancela warmup agendado ao destruir o módulo', () => {
    jest.useFakeTimers();
    process.env.DASHBOARD_DOCUMENT_AVAILABILITY_WARMUP_DELAY_MS = '100';

    service.onApplicationBootstrap();
    service.onModuleDestroy();

    jest.advanceTimersByTime(150);

    const mockedUserSessionRepository = userSessionRepository as unknown as {
      find: jest.Mock;
    };
    const findUserSessionsMock = mockedUserSessionRepository.find;
    expect(findUserSessionsMock).not.toHaveBeenCalled();
  });
});
