import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;

  const mockDataSource = { query: jest.fn() };

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
});
