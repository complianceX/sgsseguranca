import { Repository } from 'typeorm';
import { TenantService } from '../common/tenant/tenant.service';
import { CorrectiveAction } from './entities/corrective-action.entity';
import { CorrectiveActionsService } from './corrective-actions.service';
import { User } from '../users/entities/user.entity';
import { Notification } from '../notifications/entities/notification.entity';

const cloneAction = (
  dto: Partial<CorrectiveAction>,
): Partial<CorrectiveAction> => ({ ...dto });

function makeService(overrides: {
  correctiveActionsRepository?: Partial<Repository<CorrectiveAction>>;
  tenantId?: string;
}) {
  const repo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn((dto: Partial<CorrectiveAction>) => cloneAction(dto)),
    save: jest.fn((entity: Partial<CorrectiveAction>) =>
      Promise.resolve(entity as CorrectiveAction),
    ),
    createQueryBuilder: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    }),
    ...overrides.correctiveActionsRepository,
  } as unknown as Repository<CorrectiveAction>;

  const usersRepository = {} as Repository<User>;
  const notificationsRepository = {} as Repository<Notification>;
  const tenantService = {
    getTenantId: jest.fn().mockReturnValue(overrides.tenantId ?? 'company-1'),
  } as unknown as TenantService;
  const nonConformitiesService = {} as never;
  const auditsService = {} as never;
  const notificationsService = {} as never;

  return new CorrectiveActionsService(
    repo,
    usersRepository,
    notificationsRepository,
    nonConformitiesService,
    auditsService,
    notificationsService,
    tenantService,
  );
}

describe('CorrectiveActionsService', () => {
  describe('create()', () => {
    it('uses DEFAULT_SLA_BY_PRIORITY when sla_days and due_date are not provided', async () => {
      const saved: Partial<CorrectiveAction> = {};
      const repo = {
        create: jest.fn((dto: Partial<CorrectiveAction>) => cloneAction(dto)),
        save: jest.fn((entity: Partial<CorrectiveAction>) => {
          Object.assign(saved, entity);
          return Promise.resolve(entity as CorrectiveAction);
        }),
      };
      const service = makeService({
        correctiveActionsRepository: repo as unknown as Partial<
          Repository<CorrectiveAction>
        >,
      });

      const now = new Date();
      await service.create({
        title: 'Test',
        description: 'Descrição',
        priority: 'high',
      });

      // high priority SLA = 3 days
      const due = saved.due_date as unknown as Date;
      expect(due).toBeDefined();
      const diffDays = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      expect(Math.round(diffDays)).toBe(3);
    });

    it('defaults priority to medium and sla_days to 7 when not provided', async () => {
      const saved: Partial<CorrectiveAction> = {};
      const repo = {
        create: jest.fn((dto: Partial<CorrectiveAction>) => cloneAction(dto)),
        save: jest.fn((entity: Partial<CorrectiveAction>) => {
          Object.assign(saved, entity);
          return Promise.resolve(entity as CorrectiveAction);
        }),
      };
      const service = makeService({
        correctiveActionsRepository: repo as unknown as Partial<
          Repository<CorrectiveAction>
        >,
      });

      await service.create({ title: 'Test', description: 'Descrição' });

      expect(saved.priority).toBe('medium');
      expect(saved.sla_days).toBe(7);
    });

    it('sets escalation_level to 0 on creation', async () => {
      const saved: Partial<CorrectiveAction> = {};
      const repo = {
        create: jest.fn((dto: Partial<CorrectiveAction>) => cloneAction(dto)),
        save: jest.fn((entity: Partial<CorrectiveAction>) => {
          Object.assign(saved, entity);
          return Promise.resolve(entity as CorrectiveAction);
        }),
      };
      const service = makeService({
        correctiveActionsRepository: repo as unknown as Partial<
          Repository<CorrectiveAction>
        >,
      });

      await service.create({ title: 'Test', description: 'Descrição' });

      expect(saved.escalation_level).toBe(0);
      expect(saved.status).toBe('open');
    });
  });

  describe('findSummary()', () => {
    it('computes complianceRate as (done / total) * 100', async () => {
      const repo = {
        count: jest
          .fn()
          .mockResolvedValueOnce(10) // total
          .mockResolvedValueOnce(3) // open
          .mockResolvedValueOnce(2) // in_progress
          .mockResolvedValueOnce(1) // overdue
          .mockResolvedValueOnce(4), // done
        createQueryBuilder: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          addSelect: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          groupBy: jest.fn().mockReturnThis(),
          getRawMany: jest.fn().mockResolvedValue([]),
        }),
      };
      const service = makeService({
        correctiveActionsRepository: repo as unknown as Partial<
          Repository<CorrectiveAction>
        >,
      });

      const result = await service.findSummary();

      expect(result.total).toBe(10);
      expect(result.done).toBe(4);
      expect(result.complianceRate).toBe(40);
    });

    it('returns complianceRate 100 when total is 0', async () => {
      const repo = {
        count: jest.fn().mockResolvedValue(0),
        createQueryBuilder: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          addSelect: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          groupBy: jest.fn().mockReturnThis(),
          getRawMany: jest.fn().mockResolvedValue([]),
        }),
      };
      const service = makeService({
        correctiveActionsRepository: repo as unknown as Partial<
          Repository<CorrectiveAction>
        >,
      });

      const result = await service.findSummary();

      expect(result.complianceRate).toBe(100);
    });
  });

  describe('getSlaOverview()', () => {
    it('counts overdue and done correctly from action list', async () => {
      const now = new Date();
      const past = new Date(now.getTime() - 86400000);

      const actions = [
        {
          status: 'overdue',
          priority: 'high',
          due_date: past,
          closed_at: null,
          created_at: now,
        },
        {
          status: 'done',
          priority: 'low',
          due_date: past,
          closed_at: now,
          created_at: past,
        },
        {
          status: 'open',
          priority: 'medium',
          due_date: new Date(now.getTime() + 86400000),
          closed_at: null,
          created_at: now,
        },
      ] as unknown as CorrectiveAction[];

      const repo = {
        find: jest.fn().mockResolvedValue(actions),
      };
      const service = makeService({
        correctiveActionsRepository: repo as Partial<
          Repository<CorrectiveAction>
        >,
      });

      const result = await service.getSlaOverview();

      expect(result.total).toBe(3);
      expect(result.overdue).toBe(1);
      expect(result.done).toBe(1);
    });

    it('returns avgResolutionDays 0.0 when no closed actions', async () => {
      const repo = {
        find: jest.fn().mockResolvedValue([]),
      };
      const service = makeService({
        correctiveActionsRepository: repo as Partial<
          Repository<CorrectiveAction>
        >,
      });

      const result = await service.getSlaOverview();

      expect(result.avgResolutionDays).toBe('0.0');
    });
  });
});
