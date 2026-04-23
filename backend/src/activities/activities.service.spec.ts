import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { TenantService } from '../common/tenant/tenant.service';
import { Activity } from './entities/activity.entity';
import { ActivitiesService } from './activities.service';

describe('ActivitiesService', () => {
  const createService = () => {
    const getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
    const andWhere = jest.fn().mockReturnThis();
    const where = jest.fn().mockReturnThis();
    const take = jest.fn().mockReturnThis();
    const skip = jest.fn().mockReturnThis();
    const orderBy = jest.fn().mockReturnThis();
    const createQueryBuilder = jest.fn().mockReturnValue({
      orderBy,
      skip,
      take,
      where,
      andWhere,
      getManyAndCount,
    });
    const create = jest.fn((input: Partial<Activity>) => input);
    const save = jest.fn((input: Partial<Activity>) =>
      Promise.resolve({
        id: 'activity-1',
        ...input,
      }),
    );

    const repository = {
      createQueryBuilder,
      create,
      save,
    } as unknown as Partial<Repository<Activity>>;
    const tenantService = {
      getTenantId: jest.fn().mockReturnValue('company-1'),
    } as Partial<TenantService>;
    const cacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    const service = new ActivitiesService(
      repository as Repository<Activity>,
      tenantService as TenantService,
      cacheManager as never,
    );

    return {
      service,
      repository,
      createQueryBuilder,
      orderBy,
      cacheManager,
    };
  };

  it('orders paginated results by created_at DESC', async () => {
    const { service, orderBy } = createService();

    await service.findPaginated({ page: 1, limit: 20 });

    expect(orderBy).toHaveBeenCalledWith('activity.created_at', 'DESC');
  });

  it('persiste company_id do tenant autenticado ao criar atividade', async () => {
    const { service, repository, cacheManager } = createService();

    await service.create({
      nome: 'Escavação',
      descricao: 'Frente leste',
      status: true,
    });

    expect(repository.create).toHaveBeenCalledWith({
      nome: 'Escavação',
      descricao: 'Frente leste',
      status: true,
      company_id: 'company-1',
    });
    expect(cacheManager.del).toHaveBeenCalledWith(
      'catalog:activities:company-1',
    );
  });

  it('rejeita company_id forjado no payload ao criar atividade', async () => {
    const { service, repository } = createService();

    await expect(
      service.create({
        nome: 'Escavação',
        company_id: 'tenant-forjado',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(repository.create).not.toHaveBeenCalled();
  });
});
