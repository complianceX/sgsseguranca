import { ToolsService } from './tools.service';

describe('ToolsService (catalog cache)', () => {
  const tenantId = 'tenant-tool-1';
  type EntityLike = {
    id?: string;
    company_id?: string;
    [key: string]: unknown;
  };

  const createService = () => {
    const toolsRepository = {
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

    const service = new ToolsService(
      toolsRepository as never,
      cacheManager as never,
      tenantService as never,
    );

    return { service, toolsRepository, cacheManager };
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('uses cached values when available', async () => {
    const { service, toolsRepository, cacheManager } = createService();
    const cachedRows = [{ id: 'tool-1', nome: 'Martelo' }];
    cacheManager.get.mockResolvedValue({
      'take:500|select:*': cachedRows,
    });

    const result = await service.findAll();

    expect(result).toEqual(cachedRows);
    expect(toolsRepository.find).not.toHaveBeenCalled();
  });

  it('queries database and caches result on miss', async () => {
    const { service, toolsRepository, cacheManager } = createService();
    const dbRows = [{ id: 'tool-2', nome: 'Parafusadeira' }];
    cacheManager.get.mockResolvedValue(undefined);
    toolsRepository.find.mockResolvedValue(dbRows);

    const result = await service.findAll();

    expect(result).toEqual(dbRows);
    expect(toolsRepository.find).toHaveBeenCalledWith({
      where: { company_id: tenantId },
      take: 500,
      order: { nome: 'ASC' },
    });
    expect(cacheManager.set).toHaveBeenCalledWith(
      `catalog:tools:${tenantId}`,
      { 'take:500|select:*': dbRows },
      30 * 60 * 1000,
    );
  });

  it('invalidates catalog cache on create/update/remove', async () => {
    const { service, toolsRepository, cacheManager } = createService();

    toolsRepository.save.mockImplementation((entity: EntityLike) =>
      Promise.resolve({
        ...entity,
        id: entity.id || 'tool-1',
        company_id: entity.company_id || tenantId,
      }),
    );
    toolsRepository.findOne.mockResolvedValue({
      id: 'tool-1',
      nome: 'Ferramenta',
      company_id: tenantId,
    });

    await service.create({ nome: 'Ferramenta nova' });
    await service.update('tool-1', { nome: 'Ferramenta atualizada' });
    await service.remove('tool-1');

    expect(cacheManager.del).toHaveBeenCalledWith(`catalog:tools:${tenantId}`);
    expect(cacheManager.del).toHaveBeenCalledTimes(3);
  });
});
