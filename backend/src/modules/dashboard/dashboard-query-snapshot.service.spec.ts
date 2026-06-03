import { Repository } from 'typeorm';
import { DashboardQuerySnapshotService } from './dashboard-query-snapshot.service';
import { DashboardQuerySnapshot } from './entities/dashboard-query-snapshot.entity';
import {
  DASHBOARD_CACHE_STALE_WINDOW_MS,
  DASHBOARD_CACHE_TTL_MS,
} from './dashboard-query.types';

type MockSnapshotRepository = Pick<
  Repository<DashboardQuerySnapshot>,
  'findOne' | 'upsert' | 'delete' | 'createQueryBuilder'
> & {
  findOne: jest.Mock;
  upsert: jest.Mock;
  delete: jest.Mock;
  createQueryBuilder: jest.Mock;
};

describe('DashboardQuerySnapshotService', () => {
  let repository: MockSnapshotRepository;
  let service: DashboardQuerySnapshotService;

  beforeEach(() => {
    repository = {
      findOne: jest.fn(),
      upsert: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn(() => ({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(undefined),
      })),
    } as MockSnapshotRepository;

    service = new DashboardQuerySnapshotService(repository as never);
  });

  it('retorna hit fresh quando o snapshot ainda está dentro do TTL', async () => {
    const generatedAt = new Date(Date.now() - 2_000);
    repository.findOne.mockResolvedValue({
      payload: { counts: { users: 1 } },
      generated_at: generatedAt,
      expires_at: new Date(
        generatedAt.getTime() +
          DASHBOARD_CACHE_TTL_MS +
          DASHBOARD_CACHE_STALE_WINDOW_MS,
      ),
    });

    const result = await service.read('company-1', 'summary');

    expect(result).toMatchObject({
      hit: true,
      stale: false,
      value: { counts: { users: 1 } },
      generatedAt: generatedAt.getTime(),
    });
  });

  it('retorna stale quando o snapshot saiu do TTL mas ainda está na janela de stale', async () => {
    const generatedAt = new Date(Date.now() - DASHBOARD_CACHE_TTL_MS - 2_000);
    repository.findOne.mockResolvedValue({
      payload: { counts: { users: 2 } },
      generated_at: generatedAt,
      expires_at: new Date(Date.now() + 10_000),
    });

    const result = await service.read('company-1', 'summary');

    expect(result).toMatchObject({
      hit: false,
      stale: true,
      value: { counts: { users: 2 } },
      generatedAt: generatedAt.getTime(),
    });
  });

  it('calcula expires_at com TTL + stale window ao persistir o snapshot', async () => {
    const generatedAt = new Date('2026-04-12T10:00:00.000Z');

    await service.upsert(
      'company-1',
      'kpis',
      { leading: { apr_before_task: { total: 1 } } },
      generatedAt,
    );

    expect(repository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: 'company-1',
        query_type: 'kpis',
        generated_at: generatedAt,
        expires_at: new Date(
          generatedAt.getTime() +
            DASHBOARD_CACHE_TTL_MS +
            DASHBOARD_CACHE_STALE_WINDOW_MS,
        ),
      }),
      ['company_id', 'query_type'],
    );
  });
});
