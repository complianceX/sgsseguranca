import { ActivitiesService } from './activities.service';

describe('ActivitiesService (catalog cache)', () => {
  const tenantId = 'tenant-activity-1';
  type EntityLike = {
    id?: string;
    company_id?: string;
    [key: string]: unknown;
  };

  const createService = () => {
    const activitiesRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((data: EntityLike) => data),
      save: jest.fn(),
      remove: jest.fn(),
      createQueryBuilder: jest.fn(),
      count: jest.fn(),
    };

    const cacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    const tenantService = {
      getTenantId: jest.fn(() => tenantId),
    };

    const service = new ActivitiesService(
      activitiesRepository as never,
      tenantService as never,
      cacheManager as never,
    );

    return { service, activitiesRepository, cacheManager };
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns data from cache when available', async () => {
    const { service, activitiesRepository, cacheManager } = createService();
    const cachedRows = [{ id: 'act-1', nome: 'Solda' }];
    cacheManager.get.mockResolvedValue(cachedRows);

    const result = await service.findAll();

    expect(result).toEqual(cachedRows);
    expect(activitiesRepository.find).not.toHaveBeenCalled();
  });

  it('loads from repository and caches result on miss', async () => {
    const { service, activitiesRepository, cacheManager } = createService();
    const dbRows = [{ id: 'act-2', nome: 'Escavação' }];
    cacheManager.get.mockResolvedValue(undefined);
    activitiesRepository.find.mockResolvedValue(dbRows);

    const result = await service.findAll();

    expect(result).toEqual(dbRows);
    expect(activitiesRepository.find).toHaveBeenCalledWith({
      where: { company_id: tenantId },
      take: 500,
      order: { nome: 'ASC' },
    });
    expect(cacheManager.set).toHaveBeenCalledWith(
      `catalog:activities:${tenantId}`,
      dbRows,
      30 * 60 * 1000,
    );
  });

  it('invalidates cache on create/update/remove', async () => {
    const { service, activitiesRepository, cacheManager } = createService();

    activitiesRepository.save.mockImplementation((entity: EntityLike) =>
      Promise.resolve({
        ...entity,
        id: entity.id || 'act-1',
        company_id: entity.company_id || tenantId,
      }),
    );
    activitiesRepository.findOne.mockResolvedValue({
      id: 'act-1',
      nome: 'Atividade base',
      company_id: tenantId,
    });

    await service.create({ nome: 'Atividade nova' });
    await service.update('act-1', { nome: 'Atividade atualizada' });
    await service.remove('act-1');

    expect(cacheManager.del).toHaveBeenCalledWith(
      `catalog:activities:${tenantId}`,
    );
    expect(cacheManager.del).toHaveBeenCalledTimes(3);
  });
});
