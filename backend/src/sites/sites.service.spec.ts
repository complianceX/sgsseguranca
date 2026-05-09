import type { Repository } from 'typeorm';
import { TenantService } from '../common/tenant/tenant.service';
import { Site } from './entities/site.entity';
import { SitesService } from './sites.service';

function makeSitesQueryBuilder() {
  return {
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  };
}

describe('SitesService.findPaginated', () => {
  it('retorna lista vazia sem ampliar escopo quando usuario operacional nao tem obra no contexto', async () => {
    const qb = makeSitesQueryBuilder();
    const repository = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    } as unknown as jest.Mocked<Repository<Site>>;
    const tenantService = {
      getContext: jest.fn().mockReturnValue({
        companyId: '11111111-1111-4111-8111-111111111111',
        isSuperAdmin: false,
        userId: '22222222-2222-4222-8222-222222222222',
        siteScope: 'single',
        siteIds: [],
      }),
    } as unknown as jest.Mocked<TenantService>;
    const service = new SitesService(repository, tenantService);

    const result = await service.findPaginated({ page: 1, limit: 100 });

    expect(qb.where).toHaveBeenCalledWith('site.company_id = :companyId', {
      companyId: '11111111-1111-4111-8111-111111111111',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('1 = 0');
    expect(result.data).toEqual([]);
  });
});
