import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;

  const mockDataSource: { query: jest.Mock; driver?: unknown } = {
    query: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('checkDatabase()', () => {
    it('deve retornar healthy:true quando o banco responde', async () => {
      mockDataSource.query.mockResolvedValue([{ '?column?': 1 }]);

      const result = await service.checkDatabase();

      expect(result.healthy).toBe(true);
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
      expect(result.error).toBeUndefined();
    });

    it('deve retornar healthy:false com mensagem de erro quando o banco falha', async () => {
      mockDataSource.query.mockRejectedValue(new Error('connection refused'));

      const result = await service.checkDatabase();

      expect(result.healthy).toBe(false);
      expect(result.error).toBe('connection refused');
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getMemoryUsage()', () => {
    it('deve retornar campos numéricos de memória em MB', () => {
      const result = service.getMemoryUsage();

      expect(typeof result.heapUsed).toBe('number');
      expect(typeof result.heapTotal).toBe('number');
      expect(typeof result.rss).toBe('number');
      expect(typeof result.external).toBe('number');
      expect(result.percentage).toBeGreaterThanOrEqual(0);
      expect(result.percentage).toBeLessThanOrEqual(100);
    });
  });

  describe('getPoolStats()', () => {
    afterEach(() => {
      delete mockDataSource.driver;
    });

    it('returns null when the driver does not expose a master pool', () => {
      mockDataSource.driver = {};
      expect(service.getPoolStats()).toBeNull();
    });

    it('returns master snapshot with computed inUse and utilization', () => {
      mockDataSource.driver = {
        master: {
          totalCount: 7,
          idleCount: 2,
          waitingCount: 0,
          options: { max: 10 },
        },
      };
      const stats = service.getPoolStats();
      expect(stats).toEqual({
        total: 7,
        idle: 2,
        waiting: 0,
        inUse: 5,
        max: 10,
        utilization: 0.5,
        replica: null,
      });
    });

    it('caps inUse at zero when total < idle (transient race)', () => {
      mockDataSource.driver = {
        master: {
          totalCount: 1,
          idleCount: 3,
          waitingCount: 0,
          options: { max: 10 },
        },
      };
      const stats = service.getPoolStats();
      expect(stats?.inUse).toBe(0);
    });

    it('returns utilization=0 when max is unknown', () => {
      mockDataSource.driver = {
        master: { totalCount: 5, idleCount: 1, waitingCount: 0 },
      };
      expect(service.getPoolStats()?.utilization).toBe(0);
    });

    it('includes replica snapshot when slaves are configured', () => {
      mockDataSource.driver = {
        master: {
          totalCount: 5,
          idleCount: 1,
          waitingCount: 0,
          options: { max: 10 },
        },
        slaves: [
          {
            totalCount: 3,
            idleCount: 3,
            waitingCount: 0,
            options: { max: 10 },
          },
        ],
      };
      const stats = service.getPoolStats();
      expect(stats?.replica).toEqual({
        total: 3,
        idle: 3,
        waiting: 0,
        inUse: 0,
        max: 10,
        utilization: 0,
      });
    });

    it('exposes waiting count for back-pressure detection', () => {
      mockDataSource.driver = {
        master: {
          totalCount: 10,
          idleCount: 0,
          waitingCount: 7,
          options: { max: 10 },
        },
      };
      const stats = service.getPoolStats();
      expect(stats?.waiting).toBe(7);
      expect(stats?.utilization).toBe(1);
    });
  });
});
