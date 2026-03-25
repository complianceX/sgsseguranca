import { MachinesService } from './machines.service';

describe('MachinesService (catalog cache)', () => {
  const tenantId = 'tenant-machine-1';
  type EntityLike = {
    id?: string;
    company_id?: string;
    [key: string]: unknown;
  };

  const createService = () => {
    const machinesRepository = {
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

    const service = new MachinesService(
      machinesRepository as never,
      cacheManager as never,
      tenantService as never,
    );

    return { service, machinesRepository, cacheManager };
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns cached rows on cache hit', async () => {
    const { service, machinesRepository, cacheManager } = createService();
    const cachedRows = [{ id: 'machine-1', nome: 'Guindaste' }];
    cacheManager.get.mockResolvedValue({
      'take:500|select:*': cachedRows,
    });

    const result = await service.findAll();

    expect(result).toEqual(cachedRows);
    expect(machinesRepository.find).not.toHaveBeenCalled();
  });

  it('queries repository and stores cache on miss', async () => {
    const { service, machinesRepository, cacheManager } = createService();
    const dbRows = [{ id: 'machine-2', nome: 'Empilhadeira' }];
    cacheManager.get.mockResolvedValue(undefined);
    machinesRepository.find.mockResolvedValue(dbRows);

    const result = await service.findAll();

    expect(result).toEqual(dbRows);
    expect(machinesRepository.find).toHaveBeenCalledWith({
      where: { company_id: tenantId },
      take: 500,
      order: { nome: 'ASC' },
    });
    expect(cacheManager.set).toHaveBeenCalledWith(
      `catalog:machines:${tenantId}`,
      { 'take:500|select:*': dbRows },
      30 * 60 * 1000,
    );
  });

  it('invalidates cache when create/update/remove happens', async () => {
    const { service, machinesRepository, cacheManager } = createService();

    machinesRepository.save.mockImplementation((entity: EntityLike) =>
      Promise.resolve({
        ...entity,
        id: entity.id || 'machine-1',
        company_id: entity.company_id || tenantId,
      }),
    );
    machinesRepository.findOne.mockResolvedValue({
      id: 'machine-1',
      nome: 'Máquina base',
      company_id: tenantId,
    });

    await service.create({ nome: 'Máquina nova' });
    await service.update('machine-1', { nome: 'Máquina atualizada' });
    await service.remove('machine-1');

    expect(cacheManager.del).toHaveBeenCalledWith(
      `catalog:machines:${tenantId}`,
    );
    expect(cacheManager.del).toHaveBeenCalledTimes(3);
  });
});
