import { Repository } from 'typeorm';
import { TenantService } from '../common/tenant/tenant.service';
import { Activity } from './entities/activity.entity';
import { ActivitiesService } from './activities.service';

describe('ActivitiesService', () => {
  it('orders paginated results by created_at DESC', async () => {
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

    const repository = {
      createQueryBuilder,
    } as Partial<Repository<Activity>>;
    const tenantService = {
      getTenantId: jest.fn().mockReturnValue('company-1'),
    } as Partial<TenantService>;

    const service = new ActivitiesService(
      repository as Repository<Activity>,
      tenantService as TenantService,
    );

    await service.findPaginated({ page: 1, limit: 20 });

    expect(orderBy).toHaveBeenCalledWith('activity.created_at', 'DESC');
  });
});
