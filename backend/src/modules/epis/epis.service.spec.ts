import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EpisService } from './epis.service';
import { Epi } from './entities/epi.entity';

const TENANT_ID = 'company-uuid-1';

const makeEpi = (overrides: Partial<Epi> = {}): Epi =>
  ({
    id: 'epi-uuid-1',
    nome: 'Capacete de Segurança',
    ca: 'CA-12345',
    validade_ca: new Date('2025-12-31'),
    descricao: 'Capacete classe A',
    status: true,
    company_id: TENANT_ID,
    ...overrides,
  }) as Epi;

const makeService = (tenantId: string | undefined = TENANT_ID) => {
  const getMany = jest.fn().mockResolvedValue([]);
  const getManyAndCount = jest.fn().mockResolvedValue([[], 0]);

  const queryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany,
    getManyAndCount,
  };

  const episRepository = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((data: Partial<Epi>) => data as Epi),
    save: jest.fn((entity: Epi) => Promise.resolve({ ...entity })),
    remove: jest.fn().mockResolvedValue(undefined),
    merge: jest.fn((entity: Epi, data: Partial<Epi>) =>
      Object.assign(entity, data),
    ),
    count: jest.fn().mockResolvedValue(0),
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
  };

  const cacheManager = {
    get: jest.fn().mockResolvedValue(undefined),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };

  const tenantService = {
    getTenantId: jest.fn(() => tenantId),
  };

  const service = new EpisService(
    episRepository as never,
    cacheManager as never,
    tenantService as never,
  );

  return { service, episRepository, cacheManager, queryBuilder, tenantService };
};

describe('EpisService', () => {
  afterEach(() => jest.clearAllMocks());

  describe('getTenantId — isolamento de tenant', () => {
    it('lança BadRequestException quando contexto de empresa não está definido', async () => {
      // JS usa o default quando undefined é passado; sobrescrever o mock diretamente
      const { service, tenantService } = makeService();
      tenantService.getTenantId.mockReturnValue(undefined as unknown as string);
      await expect(service.create({ nome: 'Luva' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('injeta company_id do tenant e ignora company_id do payload', async () => {
      const { service, episRepository } = makeService();
      episRepository.save.mockResolvedValueOnce(makeEpi());

      await service.create({
        nome: 'Bota',
        company_id: 'tentativa-de-injecao',
      } as unknown as Partial<Epi>);

      const created = episRepository.create.mock.calls[0][0];
      expect(created.company_id).toBe(TENANT_ID);
    });
  });

  describe('create', () => {
    it('persiste EPI com company_id do tenant', async () => {
      const { service, episRepository } = makeService();
      const saved = makeEpi();
      episRepository.save.mockResolvedValueOnce(saved);

      const result = await service.create({ nome: 'Capacete' });

      expect(episRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ company_id: TENANT_ID }),
      );
      expect(result.id).toBe(saved.id);
    });

    it('invalida cache após create', async () => {
      const { service, episRepository, cacheManager } = makeService();
      episRepository.save.mockResolvedValueOnce(makeEpi());

      await service.create({ nome: 'Avental' });

      expect(cacheManager.del).toHaveBeenCalledWith(
        `catalog:epis:${TENANT_ID}`,
      );
    });

    it('sanitiza campos sensíveis (role, permissions) do payload', async () => {
      const { service, episRepository } = makeService();
      episRepository.save.mockResolvedValueOnce(makeEpi());

      await service.create({
        nome: 'Mascara',
        role: 'admin',
        permissions: ['*'],
      } as unknown as Partial<Epi>);

      const created = episRepository.create.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(created['role']).toBeUndefined();
      expect(created['permissions']).toBeUndefined();
    });
  });

  describe('findOne', () => {
    it('retorna EPI quando encontrado no tenant', async () => {
      const { service, episRepository } = makeService();
      const epi = makeEpi();
      episRepository.findOne.mockResolvedValueOnce(epi);

      const result = await service.findOne(epi.id);
      expect(result).toEqual(epi);
    });

    it('lança NotFoundException quando EPI não existe ou pertence a outro tenant', async () => {
      const { service, episRepository } = makeService();
      episRepository.findOne.mockResolvedValueOnce(null);

      await expect(service.findOne('epi-inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('aplica filtro de tenant na query', async () => {
      const { service, episRepository } = makeService();
      episRepository.findOne.mockResolvedValueOnce(makeEpi());

      await service.findOne('epi-uuid-1');

      expect(episRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          where: expect.objectContaining({ company_id: TENANT_ID }),
        }),
      );
    });
  });

  describe('update', () => {
    it('atualiza EPI e invalida cache', async () => {
      const { service, episRepository, cacheManager } = makeService();
      const epi = makeEpi();
      episRepository.findOne.mockResolvedValueOnce(epi);
      episRepository.save.mockResolvedValueOnce({
        ...epi,
        nome: 'Capacete Atualizado',
      });

      await service.update(epi.id, { nome: 'Capacete Atualizado' });

      expect(cacheManager.del).toHaveBeenCalledWith(
        `catalog:epis:${TENANT_ID}`,
      );
    });

    it('não permite alterar company_id via payload', async () => {
      const { service, episRepository } = makeService();
      const epi = makeEpi();
      episRepository.findOne.mockResolvedValueOnce(epi);
      episRepository.save.mockResolvedValueOnce(epi);

      await service.update(epi.id, {
        company_id: 'outro-tenant',
      } as unknown as Partial<Epi>);

      const merged = episRepository.merge.mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(merged['company_id']).toBeUndefined();
    });

    it('lança NotFoundException ao tentar atualizar EPI de outro tenant', async () => {
      const { service, episRepository } = makeService();
      episRepository.findOne.mockResolvedValueOnce(null);

      await expect(service.update('epi-alheio', { nome: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('remove EPI e invalida cache', async () => {
      const { service, episRepository, cacheManager } = makeService();
      const epi = makeEpi();
      // EpisService.remove chama findOne duas vezes: uma própria + uma via super.remove
      episRepository.findOne.mockResolvedValue(epi);

      await service.remove(epi.id);

      expect(episRepository.remove).toHaveBeenCalledWith(epi);
      expect(cacheManager.del).toHaveBeenCalledWith(
        `catalog:epis:${TENANT_ID}`,
      );
    });

    it('lança NotFoundException ao remover EPI inexistente', async () => {
      const { service, episRepository } = makeService();
      episRepository.findOne.mockResolvedValueOnce(null);

      await expect(service.remove('epi-inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findPaginated', () => {
    it('aplica filtro de tenant e retorna página', async () => {
      const { service, queryBuilder } = makeService();
      queryBuilder.getManyAndCount.mockResolvedValueOnce([[makeEpi()], 1]);

      const page = await service.findPaginated({ page: 1, limit: 10 });

      expect(queryBuilder.where).toHaveBeenCalledWith(
        'epi.company_id = :tenantId',
        { tenantId: TENANT_ID },
      );
      expect(page.data).toHaveLength(1);
      expect(page.total).toBe(1);
    });

    it('aplica filtro de busca por nome/CA quando search é fornecido', async () => {
      const { service, queryBuilder } = makeService();
      queryBuilder.getManyAndCount.mockResolvedValueOnce([[], 0]);

      await service.findPaginated({ search: 'capacete' });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('LOWER(epi.nome) LIKE :search'),
        expect.objectContaining({ search: '%capacete%' }),
      );
    });

    it('não aplica andWhere de busca quando search está vazio', async () => {
      const { service, queryBuilder } = makeService();
      queryBuilder.getManyAndCount.mockResolvedValueOnce([[], 0]);

      await service.findPaginated({ search: '' });

      expect(queryBuilder.andWhere).not.toHaveBeenCalled();
    });

    it('usa defaults de paginação quando page/limit não fornecidos', async () => {
      const { service, queryBuilder } = makeService();
      queryBuilder.getManyAndCount.mockResolvedValueOnce([[], 0]);

      await service.findPaginated();

      expect(queryBuilder.take).toHaveBeenCalledWith(20);
      expect(queryBuilder.skip).toHaveBeenCalledWith(0);
    });
  });

  describe('findCaExpirySummary', () => {
    it('conta EPIs expirados e a vencer corretamente', async () => {
      const { service, queryBuilder } = makeService();
      const yesterday = new Date(Date.now() - 86_400_000);
      const inTenDays = new Date(Date.now() + 10 * 86_400_000);
      const inSixtyDays = new Date(Date.now() + 60 * 86_400_000);

      queryBuilder.getMany.mockResolvedValueOnce([
        makeEpi({ validade_ca: yesterday }),
        makeEpi({ validade_ca: inTenDays }),
        makeEpi({ validade_ca: inSixtyDays }),
        makeEpi({ validade_ca: undefined }),
      ]);

      const summary = await service.findCaExpirySummary(30);

      expect(summary.total).toBe(4);
      expect(summary.expired).toBe(1);
      expect(summary.expiringSoon).toBe(1);
      expect(summary.withoutValidity).toBe(1);
    });

    it('aplica filtro de tenant na query de validade', async () => {
      const { service, queryBuilder } = makeService();
      queryBuilder.getMany.mockResolvedValueOnce([]);

      await service.findCaExpirySummary();

      expect(queryBuilder.where).toHaveBeenCalledWith(
        'epi.company_id = :tenantId',
        { tenantId: TENANT_ID },
      );
    });
  });

  describe('count', () => {
    it('aplica filtro de tenant no count', async () => {
      const { service, episRepository } = makeService();
      episRepository.count.mockResolvedValueOnce(5);

      const result = await service.count();

      expect(episRepository.count).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          where: expect.objectContaining({ company_id: TENANT_ID }),
        }),
      );
      expect(result).toBe(5);
    });
  });

  describe('dispatchExpiryNotifications', () => {
    it('retorna contagem de EPIs com CA vencendo nos proximos dias', async () => {
      const { service, queryBuilder } = makeService();
      const expiring = [makeEpi(), makeEpi()];
      queryBuilder.getMany.mockResolvedValueOnce(expiring);

      const result = await service.dispatchExpiryNotifications(30);

      expect(result.dispatched).toBe(2);
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('aplica filtro BETWEEN para validade_ca na janela de dias', async () => {
      const { service, queryBuilder } = makeService();
      queryBuilder.getMany.mockResolvedValueOnce([]);

      await service.dispatchExpiryNotifications(30);

      expect(queryBuilder.where).toHaveBeenCalledWith(
        'epi.validade_ca BETWEEN :now AND :future',
        expect.objectContaining({
          now: expect.any(Date) as unknown,
          future: expect.any(Date) as unknown,
        }),
      );
    });

    it('aplica filtro deleted_at IS NULL', async () => {
      const { service, queryBuilder } = makeService();
      queryBuilder.getMany.mockResolvedValueOnce([]);

      await service.dispatchExpiryNotifications(30);

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'epi.deleted_at IS NULL',
      );
    });

    it('aplica filtro de tenant quando company_id esta definido', async () => {
      const { service, queryBuilder } = makeService();
      queryBuilder.getMany.mockResolvedValueOnce([]);

      await service.dispatchExpiryNotifications(30);

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'epi.company_id = :tenantId',
        { tenantId: TENANT_ID },
      );
    });

    it('retorna dispatched=0 quando nao ha EPIs vencendo', async () => {
      const { service, queryBuilder } = makeService();
      queryBuilder.getMany.mockResolvedValueOnce([]);

      const result = await service.dispatchExpiryNotifications(7);

      expect(result.dispatched).toBe(0);
    });
  });
});
