import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TrainingsService } from './trainings.service';
import { Training } from './entities/training.entity';

const COMPANY_ID = 'company-uuid-1';
const SITE_ID = 'site-uuid-1';
const USER_ID = 'user-uuid-1';

const makeTraining = (overrides: Partial<Training> = {}): Training =>
  ({
    id: 'training-uuid-1',
    nome: 'NR-35 Trabalho em Altura',
    nr_codigo: 'NR-35',
    user_id: USER_ID,
    company_id: COMPANY_ID,
    data_conclusao: '2025-01-10' as unknown as Date,
    data_vencimento: '2026-01-10' as unknown as Date,
    carga_horaria: 8,
    ...overrides,
  }) as Training;

const makeService = (opts: { companyWideAccess?: boolean } = {}) => {
  const { companyWideAccess = true } = opts;

  const userRepo = { findOne: jest.fn().mockResolvedValue({ id: USER_ID }) };
  const manager = { getRepository: jest.fn().mockReturnValue(userRepo) };

  const queryBuilderBase = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(null),
    getMany: jest.fn().mockResolvedValue([]),
  };

  const trainingsRepository = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((d: Partial<Training>) => d as Training),
    save: jest.fn((e: Training) => Promise.resolve({ ...e })),
    remove: jest.fn().mockResolvedValue(undefined),
    count: jest.fn().mockResolvedValue(0),
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilderBase),
    manager,
  };

  const tenantService = {
    getTenantId: jest.fn(() => COMPANY_ID),
    getContext: jest.fn(() => ({
      companyId: COMPANY_ID,
      siteIds: companyWideAccess ? [] : [SITE_ID],
      siteScope: companyWideAccess ? 'all' : 'site',
      isSuperAdmin: false,
    })),
    isSuperAdmin: jest.fn(() => false),
  };

  const documentStorageService = { getSignedUrl: jest.fn() };
  const documentGovernanceService = {};
  const documentRegistryService = {
    findByEntityId: jest.fn().mockResolvedValue(null),
    upsertFromEntityEvent: jest.fn().mockResolvedValue(undefined),
  };

  const service = new TrainingsService(
    trainingsRepository as never,
    tenantService as never,
    documentStorageService as never,
    documentGovernanceService as never,
    documentRegistryService as never,
  );

  return {
    service,
    trainingsRepository,
    tenantService,
    userRepo,
    queryBuilderBase,
  };
};

describe('TrainingsService — validações de cadastro', () => {
  afterEach(() => jest.clearAllMocks());

  describe('create — validação de datas', () => {
    it('lança BadRequestException quando data_vencimento < data_conclusao', async () => {
      const { service, trainingsRepository } = makeService();
      trainingsRepository.findOne.mockResolvedValueOnce(makeTraining());

      await expect(
        service.create({
          nome: 'NR-35',
          user_id: USER_ID,
          data_conclusao: '2025-06-01',
          data_vencimento: '2025-05-01',
        } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('lança BadRequestException quando data_vencimento === data_conclusao', async () => {
      const { service } = makeService();

      await expect(
        service.create({
          nome: 'NR-10',
          user_id: USER_ID,
          data_conclusao: '2025-06-01',
          data_vencimento: '2025-06-01',
        } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('aceita quando data_vencimento > data_conclusao', async () => {
      const { service, trainingsRepository } = makeService();
      trainingsRepository.save.mockResolvedValueOnce(makeTraining());

      await expect(
        service.create({
          nome: 'NR-35',
          user_id: USER_ID,
          data_conclusao: '2025-01-01',
          data_vencimento: '2026-01-01',
        } as never),
      ).resolves.toBeDefined();
    });

    it('aceita quando apenas data_conclusao é fornecida (sem data_vencimento)', async () => {
      const { service, trainingsRepository } = makeService();
      trainingsRepository.save.mockResolvedValueOnce(makeTraining());

      await expect(
        service.create({
          nome: 'NR-35',
          user_id: USER_ID,
          data_conclusao: '2025-01-01',
        } as never),
      ).resolves.toBeDefined();
    });

    it('aceita quando apenas data_vencimento é fornecida (sem data_conclusao)', async () => {
      const { service, trainingsRepository } = makeService();
      trainingsRepository.save.mockResolvedValueOnce(makeTraining());

      await expect(
        service.create({
          nome: 'NR-35',
          user_id: USER_ID,
          data_vencimento: '2026-01-01',
        } as never),
      ).resolves.toBeDefined();
    });

    it('rejeita company_id no payload (isolamento de tenant)', async () => {
      const { service } = makeService();

      await expect(
        service.create({
          nome: 'NR-35',
          user_id: USER_ID,
          company_id: 'tenant-malicioso',
        } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('persiste com company_id do tenant autenticado, não do payload', async () => {
      const { service, trainingsRepository } = makeService();
      trainingsRepository.save.mockResolvedValueOnce(makeTraining());

      await service.create({
        nome: 'NR-35',
        user_id: USER_ID,
      } as never);

      const saved = trainingsRepository.create.mock.calls[0][0];
      expect(saved.company_id).toBe(COMPANY_ID);
    });
  });

  describe('update — validação de datas', () => {
    it('lança BadRequestException quando nova data_vencimento < data_conclusao existente', async () => {
      const { service, trainingsRepository } = makeService();
      trainingsRepository.findOne.mockResolvedValueOnce(
        makeTraining({ data_conclusao: '2025-06-01' as unknown as Date }),
      );

      await expect(
        service.update('training-uuid-1', {
          data_vencimento: '2025-05-01',
        } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('lança BadRequestException quando nova data_conclusao > data_vencimento existente', async () => {
      const { service, trainingsRepository } = makeService();
      trainingsRepository.findOne.mockResolvedValueOnce(
        makeTraining({ data_vencimento: '2025-06-01' as unknown as Date }),
      );

      await expect(
        service.update('training-uuid-1', {
          data_conclusao: '2025-07-01',
        } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('aceita atualização quando datas são válidas', async () => {
      const { service, trainingsRepository } = makeService();
      trainingsRepository.findOne.mockResolvedValueOnce(makeTraining());
      trainingsRepository.save.mockResolvedValueOnce(
        makeTraining({ nome: 'NR-35 Atualizado' }),
      );

      await expect(
        service.update('training-uuid-1', {
          nome: 'NR-35 Atualizado',
          data_vencimento: '2027-01-01',
        } as never),
      ).resolves.toBeDefined();
    });

    it('aceita atualização sem datas (campos omitidos)', async () => {
      const { service, trainingsRepository } = makeService();
      trainingsRepository.findOne.mockResolvedValueOnce(makeTraining());
      trainingsRepository.save.mockResolvedValueOnce(
        makeTraining({ nome: 'NR-35 Atualizado' }),
      );

      await expect(
        service.update('training-uuid-1', {
          nome: 'NR-35 Atualizado',
        } as never),
      ).resolves.toBeDefined();
    });

    it('lança NotFoundException quando treinamento não existe', async () => {
      const { service, trainingsRepository } = makeService();
      trainingsRepository.findOne.mockResolvedValueOnce(null);

      await expect(
        service.update('inexistente', { nome: 'X' } as never),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('create — isolamento de usuário por scope', () => {
    it('permite criar treinamento para qualquer usuário quando scope é company-wide', async () => {
      const { service, trainingsRepository } = makeService({
        companyWideAccess: true,
      });
      trainingsRepository.save.mockResolvedValueOnce(makeTraining());

      await expect(
        service.create({ nome: 'NR-35', user_id: USER_ID } as never),
      ).resolves.toBeDefined();
    });

    it('lança NotFoundException quando usuário não pertence à obra atual (site-scoped)', async () => {
      const { service, userRepo } = makeService({ companyWideAccess: false });
      userRepo.findOne.mockResolvedValueOnce(null);

      await expect(
        service.create({
          nome: 'NR-35',
          user_id: 'user-de-outra-obra',
        } as never),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('remove treinamento existente', async () => {
      const { service, trainingsRepository } = makeService();
      const training = makeTraining();
      trainingsRepository.findOne.mockResolvedValueOnce(training);

      await service.remove(training.id);

      expect(trainingsRepository.remove).toHaveBeenCalledWith(training);
    });

    it('lança NotFoundException ao remover treinamento inexistente', async () => {
      const { service, trainingsRepository } = makeService();
      trainingsRepository.findOne.mockResolvedValueOnce(null);

      await expect(service.remove('inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
