import { RisksService } from './risks.service';

describe('RisksService (catalog cache)', () => {
  const tenantId = 'tenant-risk-1';
  type EntityLike = {
    id?: string;
    company_id?: string;
    [key: string]: unknown;
  };

  const createService = () => {
    const risksRepository = {
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

    const risksHistoryRepository = {
      create: jest.fn((data: Record<string, unknown>) => data),
      save: jest.fn(),
    };

    const riskCalculationService = {
      calculateScore: jest.fn(() => 4),
      classifyByScore: jest.fn(() => 'MÉDIO'),
    };

    const auditService = {
      log: jest.fn(),
    };

    const cacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    const tenantService = {
      getTenantId: jest.fn(() => tenantId),
    };

    const service = new RisksService(
      risksRepository as never,
      risksHistoryRepository as never,
      riskCalculationService as never,
      auditService as never,
      cacheManager as never,
      tenantService as never,
    );

    return {
      service,
      risksRepository,
      risksHistoryRepository,
      riskCalculationService,
      auditService,
      cacheManager,
    };
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns cached data on cache hit without querying repository', async () => {
    const { service, risksRepository, cacheManager } = createService();
    const cached = [{ id: 'risk-1', nome: 'Queda' }];
    cacheManager.get.mockResolvedValue({
      'take:500|select:*': cached,
    });

    const result = await service.findAll();

    expect(result).toEqual(cached);
    expect(risksRepository.find).not.toHaveBeenCalled();
  });

  it('queries repository and stores cache on miss', async () => {
    const { service, risksRepository, cacheManager } = createService();
    const dbRows = [{ id: 'risk-2', nome: 'Ruído' }];
    cacheManager.get.mockResolvedValue(undefined);
    risksRepository.find.mockResolvedValue(dbRows);

    const result = await service.findAll();

    expect(result).toEqual(dbRows);
    expect(risksRepository.find).toHaveBeenCalledWith({
      where: { company_id: tenantId },
      take: 500,
      order: { nome: 'ASC' },
    });
    expect(cacheManager.set).toHaveBeenCalledWith(
      `catalog:risks:${tenantId}`,
      { 'take:500|select:*': dbRows },
      30 * 60 * 1000,
    );
  });

  it('invalidates cache on create, update and remove', async () => {
    const { service, risksRepository, cacheManager, risksHistoryRepository } =
      createService();

    risksRepository.save.mockImplementation((entity: EntityLike) =>
      Promise.resolve({
        ...entity,
        id: entity.id || 'risk-1',
        company_id: entity.company_id || tenantId,
      }),
    );
    risksRepository.findOne.mockResolvedValue({
      id: 'risk-1',
      nome: 'Original',
      categoria: 'Operacional',
      company_id: tenantId,
      status: 'Ativo',
    });
    risksHistoryRepository.save.mockResolvedValue(undefined);

    await service.create({ nome: 'Novo risco', categoria: 'Operacional' });
    await service.update('risk-1', { nome: 'Risco atualizado' });
    await service.remove('risk-1');

    expect(cacheManager.del).toHaveBeenCalledWith(`catalog:risks:${tenantId}`);
    expect(cacheManager.del).toHaveBeenCalledTimes(3);
  });
});
