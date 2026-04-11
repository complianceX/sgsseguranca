import { Test, TestingModule } from '@nestjs/testing';
import { CacheRefreshService } from '../services/cache-refresh.service';
import { DataSource } from 'typeorm';

/**
 * 📊 Cache Refresh Service Tests
 * Validates materialized view refresh functionality
 */

describe('CacheRefreshService', () => {
  let service: CacheRefreshService;
  let mockDataSource: { query: jest.Mock };

  beforeEach(async () => {
    mockDataSource = {
      query: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheRefreshService,
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<CacheRefreshService>(CacheRefreshService);
  });

  describe('refreshDashboard', () => {
    it('should successfully refresh dashboard metrics view', async () => {
      mockDataSource.query.mockResolvedValue([]);

      const result = await service.refreshDashboard();

      expect(result.status).toBe('success');
      expect(result.table).toBe('company_dashboard_metrics');
      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('should record execution time', async () => {
      mockDataSource.query.mockResolvedValue([]);

      const result = await service.refreshDashboard();

      expect(result.duration_ms).toBeDefined();
      expect(typeof result.duration_ms).toBe('number');
      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('should handle refresh errors', async () => {
      mockDataSource.query.mockRejectedValue(new Error('View not found'));

      await expect(service.refreshDashboard()).rejects.toThrow();
    });

    it('should include timestamp in response', async () => {
      mockDataSource.query.mockResolvedValue([]);

      const result = await service.refreshDashboard();

      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp).getTime()).toBeGreaterThan(0);
    });
  });

  describe('refreshRiskRankings', () => {
    it('should successfully refresh APR risk rankings view', async () => {
      mockDataSource.query.mockResolvedValue([]);

      const result = await service.refreshRiskRankings();

      expect(result.status).toBe('success');
      expect(result.table).toBe('apr_risk_rankings');
    });

    it('should measure refresh performance', async () => {
      mockDataSource.query.mockResolvedValue([]);

      const result = await service.refreshRiskRankings();

      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('should handle refresh errors gracefully', async () => {
      mockDataSource.query.mockRejectedValue(
        new Error('View refresh in progress'),
      );

      await expect(service.refreshRiskRankings()).rejects.toThrow();
    });
  });

  describe('refreshAll', () => {
    it('should refresh all materialized views', async () => {
      mockDataSource.query.mockResolvedValue([]);

      const result = await service.refreshAll();

      expect(result.status).toMatch(/success|partial|error/);
      expect(result.views.length).toBeGreaterThan(0);
      expect(result.total_duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('should report status for each view', async () => {
      mockDataSource.query.mockResolvedValue([]);

      const result = await service.refreshAll();

      expect(
        result.views.every((v) =>
          Object.prototype.hasOwnProperty.call(v, 'status'),
        ),
      ).toBe(true);
      expect(
        result.views.every((v) =>
          Object.prototype.hasOwnProperty.call(v, 'duration_ms'),
        ),
      ).toBe(true);
    });

    it('should report overall status as success only if all views succeed', async () => {
      mockDataSource.query.mockResolvedValue([]);

      const result = await service.refreshAll();

      const allSuccess = result.views.every((v) => v.status === 'success');
      if (allSuccess) {
        expect(result.status).toBe('success');
      } else {
        expect(result.status).toMatch(/partial|error/);
      }
    });

    it('should continue refresh even if one view fails', async () => {
      // First call fails, second succeeds
      mockDataSource.query
        .mockRejectedValueOnce(new Error('First view failed'))
        .mockResolvedValueOnce([]);

      const result = await service.refreshAll();

      expect(result.views.length).toBe(2);
      expect(result.status).toBe('partial');
    });
  });

  describe('getCacheStatus', () => {
    it('should return row counts for each view', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ row_count: 50 }]) // dashboard
        .mockResolvedValueOnce([{ row_count: 200 }]); // rankings

      const result = await service.getCacheStatus();

      expect(result.views.length).toBe(2);
      expect(result.views[0].name).toBe('company_dashboard_metrics');
      expect(result.views[0].row_count).toBe(50);
      expect(result.views[1].name).toBe('apr_risk_rankings');
      expect(result.views[1].row_count).toBe(200);
    });

    it('should handle missing views gracefully', async () => {
      mockDataSource.query.mockRejectedValue(
        new Error('One or more views missing'),
      );

      await expect(service.getCacheStatus()).rejects.toThrow();
    });

    it('should include timestamp', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ row_count: 0 }])
        .mockResolvedValueOnce([{ row_count: 0 }]);

      const result = await service.getCacheStatus();

      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp).getTime()).toBeGreaterThan(0);
    });
  });
});
