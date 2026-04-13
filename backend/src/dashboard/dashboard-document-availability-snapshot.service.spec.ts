import { DashboardDocumentAvailabilitySnapshotService } from './dashboard-document-availability-snapshot.service';

type MockRepo = {
  query: jest.Mock;
  find: jest.Mock;
  upsert: jest.Mock;
  createQueryBuilder: jest.Mock;
};

function createMockRepo(): MockRepo {
  return {
    query: jest.fn().mockResolvedValue([]),
    find: jest.fn().mockResolvedValue([]),
    upsert: jest.fn().mockResolvedValue(undefined),
    createQueryBuilder: jest.fn(),
  };
}

describe('DashboardDocumentAvailabilitySnapshotService', () => {
  let snapshotRepository: MockRepo;
  let service: DashboardDocumentAvailabilitySnapshotService;

  beforeEach(() => {
    snapshotRepository = createMockRepo();

    service = new DashboardDocumentAvailabilitySnapshotService(
      createMockRepo() as never,
      createMockRepo() as never,
      createMockRepo() as never,
      createMockRepo() as never,
      createMockRepo() as never,
      createMockRepo() as never,
      createMockRepo() as never,
      createMockRepo() as never,
      createMockRepo() as never,
      createMockRepo() as never,
      snapshotRepository as never,
      { getSignedUrl: jest.fn() } as never,
      { getPresignedDownloadUrl: jest.fn() } as never,
    );
  });

  it('retorna legível e agenda refresh em background quando há snapshot stale', async () => {
    jest
      .spyOn(service as never, 'getRefreshStatus' as never)
      .mockResolvedValue({
        hasRows: true,
        lastCheckedAt: new Date('2026-04-13T10:00:00.000Z'),
        stale: true,
      });
    const scheduleSpy = jest
      .spyOn(service as never, 'scheduleRefreshCompany' as never)
      .mockReturnValue(true);

    const result = await service.scheduleRefreshIfNeeded({
      companyId: '550e8400-e29b-41d4-a716-446655440001',
      shouldCollect: true,
    });

    expect(result.readable).toBe(true);
    expect(result.hasRows).toBe(true);
    expect(result.refreshScheduled).toBe(true);
    expect(scheduleSpy).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440001',
    );
  });

  it('responde não legível quando ainda não há snapshot mas existem objetos rastreáveis', async () => {
    jest
      .spyOn(service as never, 'getRefreshStatus' as never)
      .mockResolvedValue({
        hasRows: false,
        lastCheckedAt: null,
        stale: true,
      });
    jest
      .spyOn(service as never, 'hasTrackableSnapshotSources' as never)
      .mockResolvedValue(true);
    const scheduleSpy = jest
      .spyOn(service as never, 'scheduleRefreshCompany' as never)
      .mockReturnValue(true);

    const result = await service.scheduleRefreshIfNeeded({
      companyId: '550e8400-e29b-41d4-a716-446655440002',
      shouldCollect: true,
    });

    expect(result.readable).toBe(false);
    expect(result.hasTrackableObjects).toBe(true);
    expect(result.refreshScheduled).toBe(true);
    expect(scheduleSpy).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440002',
    );
  });

  it('trata empresa sem fontes rastreáveis como leitura válida vazia', async () => {
    jest
      .spyOn(service as never, 'getRefreshStatus' as never)
      .mockResolvedValue({
        hasRows: false,
        lastCheckedAt: null,
        stale: true,
      });
    jest
      .spyOn(service as never, 'hasTrackableSnapshotSources' as never)
      .mockResolvedValue(false);
    const scheduleSpy = jest
      .spyOn(service as never, 'scheduleRefreshCompany' as never)
      .mockReturnValue(false);

    const result = await service.scheduleRefreshIfNeeded({
      companyId: '550e8400-e29b-41d4-a716-446655440003',
      shouldCollect: true,
    });

    expect(result.readable).toBe(true);
    expect(result.hasTrackableObjects).toBe(false);
    expect(result.refreshScheduled).toBe(false);
    expect(scheduleSpy).not.toHaveBeenCalled();
  });

  it('não força refresh síncrono quando a empresa não tem fontes rastreáveis', async () => {
    jest
      .spyOn(service as never, 'getRefreshStatus' as never)
      .mockResolvedValue({
        hasRows: false,
        lastCheckedAt: null,
        stale: true,
      });
    jest
      .spyOn(service as never, 'hasTrackableSnapshotSources' as never)
      .mockResolvedValue(false);
    const refreshSpy = jest
      .spyOn(service as never, 'refreshCompany' as never)
      .mockResolvedValue(undefined);

    await service.ensureSnapshotsAvailable({
      companyId: '550e8400-e29b-41d4-a716-446655440004',
      shouldCollect: true,
    });

    expect(refreshSpy).not.toHaveBeenCalled();
  });
});
