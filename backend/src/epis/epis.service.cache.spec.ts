import { EpisService } from './epis.service';

describe('EpisService (catalog cache)', () => {
  const tenantId = 'tenant-epi-1';
  type EntityLike = {
    id?: string;
    company_id?: string;
    [key: string]: unknown;
  };

  const createService = () => {
    const episRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((data: EntityLike) => data),
      save: jest.fn(),
      remove: jest.fn(),
      merge: jest.fn((entity: EntityLike, data: EntityLike) =>
        Object.assign(entity, data),
      ),
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

    const service = new EpisService(
      episRepository as never,
      cacheManager as never,
      tenantService as never,
    );

    return {
      service,
      episRepository,
      cacheManager,
    };
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns cached value on hit without DB query', async () => {
    const { service, episRepository, cacheManager } = createService();
    const cachedRows = [{ id: 'epi-1', nome: 'Capacete' }];
    cacheManager.get.mockResolvedValue({
      'take:500|select:*': cachedRows,
    });

    const result = await service.findAll();

    expect(result).toEqual(cachedRows);
    expect(episRepository.find).not.toHaveBeenCalled();
  });

  it('loads from DB and stores cache on miss', async () => {
    const { service, episRepository, cacheManager } = createService();
    const dbRows = [{ id: 'epi-2', nome: 'Luva' }];
    cacheManager.get.mockResolvedValue(undefined);
    episRepository.find.mockResolvedValue(dbRows);

    const result = await service.findAll();

    expect(result).toEqual(dbRows);
    expect(episRepository.find).toHaveBeenCalledWith({
      where: { company_id: tenantId },
      take: 500,
      order: { nome: 'ASC' },
    });
    expect(cacheManager.set).toHaveBeenCalledWith(
      `catalog:epis:${tenantId}`,
      { 'take:500|select:*': dbRows },
      30 * 60 * 1000,
    );
  });

  it('invalidates cache on create/update/remove', async () => {
    const { service, episRepository, cacheManager } = createService();

    episRepository.save.mockImplementation((entity: EntityLike) =>
      Promise.resolve({
        ...entity,
        id: entity.id || 'epi-1',
        company_id: entity.company_id || tenantId,
      }),
    );
    episRepository.findOne.mockResolvedValue({
      id: 'epi-1',
      nome: 'EPI antigo',
      company_id: tenantId,
    });

    await service.create({ nome: 'EPI novo' });
    await service.update('epi-1', { nome: 'EPI atualizado' });
    await service.remove('epi-1');

    expect(cacheManager.del).toHaveBeenCalledWith(`catalog:epis:${tenantId}`);
    expect(cacheManager.del).toHaveBeenCalledTimes(3);
  });
});
