import { QueryFailedError, Repository } from 'typeorm';
import { ServiceOrdersService } from './service-orders.service';
import { ServiceOrder } from './entities/service-order.entity';
import type { TenantService } from '../common/tenant/tenant.service';

describe('ServiceOrdersService', () => {
  let service: ServiceOrdersService;
  let repository: {
    count: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    remove: jest.Mock;
    createQueryBuilder: jest.Mock;
  };

  beforeEach(() => {
    const defaultQb = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ max: null }),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      getMany: jest.fn().mockResolvedValue([]),
    };

    repository = {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((input: Partial<ServiceOrder>) => input),
      save: jest.fn((input: Partial<ServiceOrder>) =>
        Promise.resolve(input as ServiceOrder),
      ),
      findOne: jest.fn(),
      remove: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(defaultQb),
    };

    service = new ServiceOrdersService(
      repository as unknown as Repository<ServiceOrder>,
      { getTenantId: jest.fn(() => 'company-1') } as unknown as TenantService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('gera numero sequencial por mes com base no maior numero existente', async () => {
    jest
      .useFakeTimers()
      .setSystemTime(new Date('2026-03-20T12:00:00.000Z').getTime());
    repository.createQueryBuilder.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ max: 'OS-202603-005' }),
    });

    const result = await service.create({
      titulo: 'OS teste',
      descricao_atividades: 'Descricao',
      data_emissao: '2026-03-20',
    });

    expect(result.numero).toBe('OS-202603-006');
  });

  it('rejeita company_id forjado no payload de criação', async () => {
    await expect(
      service.create({
        titulo: 'OS teste',
        descricao_atividades: 'Descricao',
        data_emissao: '2026-03-20',
        company_id: 'tenant-forjado',
      } as never),
    ).rejects.toThrow('company_id não é permitido no payload');

    expect(repository.createQueryBuilder).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejeita criacao quando o banco sinaliza numero duplicado por empresa', async () => {
    repository.save.mockRejectedValueOnce(
      new QueryFailedError('INSERT', [], {
        code: '23505',
        constraint: 'UQ_service_orders_company_numero',
      } as never),
    );

    await expect(
      service.create({
        titulo: 'OS teste',
        descricao_atividades: 'Descricao',
        data_emissao: '2026-03-20',
      }),
    ).rejects.toThrow(
      'Já existe uma ordem de serviço com este número na empresa atual.',
    );
  });
});
