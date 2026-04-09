import { AlertsService } from './alerts.service';
import { MetricsService } from './metrics.service';
import { DataSource } from 'typeorm';

function makeAlertService(metricsOverrides?: Partial<MetricsService>) {
  const metricsService = {
    snapshotAndResetHttpWindow: jest.fn().mockReturnValue({
      count: 0,
      errorCount: 0,
      errorRate: null,
      avgDurationMs: null,
      maxDurationMs: 0,
    }),
    snapshotAndResetQueueWindow: jest.fn().mockReturnValue({
      count: 0,
      errorCount: 0,
      errorRate: null,
      avgDurationMs: null,
      maxDurationMs: 0,
    }),
    snapshotAndResetPdfWindow: jest.fn().mockReturnValue({
      count: 0,
      avgDurationMs: null,
      p95DurationMs: null,
      maxDurationMs: 0,
    }),
    ...metricsOverrides,
  } as unknown as MetricsService;

  const dataSource = {
    driver: { master: undefined },
  } as unknown as DataSource;

  return new AlertsService(metricsService, dataSource);
}

describe('AlertsService', () => {
  describe('run()', () => {
    it('does not emit any warn when ALERTS_ENABLED is not true', () => {
      delete process.env.ALERTS_ENABLED;
      const service = makeAlertService();
      const warnSpy = jest
        .spyOn((service as unknown as { logger: { warn: jest.Mock } }).logger, 'warn')
        .mockImplementation(() => {});

      service.run();

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('emits HTTP_ERROR_RATE_HIGH when error rate exceeds threshold', () => {
      process.env.ALERTS_ENABLED = 'true';
      process.env.ALERTS_MIN_REQUESTS = '5';
      process.env.ALERTS_ERROR_RATE_THRESHOLD = '0.05';

      const service = makeAlertService({
        snapshotAndResetHttpWindow: jest.fn().mockReturnValue({
          count: 10,
          errorCount: 3,
          errorRate: 0.3,
          avgDurationMs: 100,
          maxDurationMs: 200,
        }),
      });

      const warnSpy = jest
        .spyOn((service as unknown as { logger: { warn: jest.Mock } }).logger, 'warn')
        .mockImplementation(() => {});

      service.run();

      const calls = warnSpy.mock.calls.map((c) => c[0]) as Array<{ alert: string }>;
      expect(calls.some((c) => c.alert === 'HTTP_ERROR_RATE_HIGH')).toBe(true);

      delete process.env.ALERTS_ENABLED;
      delete process.env.ALERTS_MIN_REQUESTS;
      delete process.env.ALERTS_ERROR_RATE_THRESHOLD;
    });

    it('emits HTTP_AVG_LATENCY_HIGH when avg latency exceeds threshold', () => {
      process.env.ALERTS_ENABLED = 'true';
      process.env.ALERTS_MIN_REQUESTS = '5';
      process.env.ALERTS_HTTP_AVG_LATENCY_MS_THRESHOLD = '2000';

      const service = makeAlertService({
        snapshotAndResetHttpWindow: jest.fn().mockReturnValue({
          count: 10,
          errorCount: 0,
          errorRate: 0,
          avgDurationMs: 5000,
          maxDurationMs: 8000,
        }),
      });

      const warnSpy = jest
        .spyOn((service as unknown as { logger: { warn: jest.Mock } }).logger, 'warn')
        .mockImplementation(() => {});

      service.run();

      const calls = warnSpy.mock.calls.map((c) => c[0]) as Array<{ alert: string }>;
      expect(calls.some((c) => c.alert === 'HTTP_AVG_LATENCY_HIGH')).toBe(true);

      delete process.env.ALERTS_ENABLED;
      delete process.env.ALERTS_MIN_REQUESTS;
      delete process.env.ALERTS_HTTP_AVG_LATENCY_MS_THRESHOLD;
    });

    it('does not emit HTTP_ERROR_RATE_HIGH when request count is below minRequests', () => {
      process.env.ALERTS_ENABLED = 'true';
      process.env.ALERTS_MIN_REQUESTS = '20';
      process.env.ALERTS_ERROR_RATE_THRESHOLD = '0.05';

      const service = makeAlertService({
        snapshotAndResetHttpWindow: jest.fn().mockReturnValue({
          count: 3,
          errorCount: 3,
          errorRate: 1.0,
          avgDurationMs: 100,
          maxDurationMs: 200,
        }),
      });

      const warnSpy = jest
        .spyOn((service as unknown as { logger: { warn: jest.Mock } }).logger, 'warn')
        .mockImplementation(() => {});

      service.run();

      const calls = warnSpy.mock.calls.map((c) => c[0]) as Array<{ alert: string }>;
      expect(calls.some((c) => c.alert === 'HTTP_ERROR_RATE_HIGH')).toBe(false);

      delete process.env.ALERTS_ENABLED;
      delete process.env.ALERTS_MIN_REQUESTS;
      delete process.env.ALERTS_ERROR_RATE_THRESHOLD;
    });
  });

  describe('getNumberEnv()', () => {
    it('falls back to default value when env var is not set', () => {
      delete process.env.ALERTS_MIN_REQUESTS;
      process.env.ALERTS_ENABLED = 'true';

      const service = makeAlertService({
        snapshotAndResetHttpWindow: jest.fn().mockReturnValue({
          count: 5,
          errorCount: 5,
          errorRate: 1.0,
          avgDurationMs: 100,
          maxDurationMs: 200,
        }),
      });

      const warnSpy = jest
        .spyOn((service as unknown as { logger: { warn: jest.Mock } }).logger, 'warn')
        .mockImplementation(() => {});

      // With default minRequests = 20, count=5 should NOT trigger alert
      service.run();

      const calls = warnSpy.mock.calls.map((c) => c[0]) as Array<{ alert: string }>;
      expect(calls.some((c) => c.alert === 'HTTP_ERROR_RATE_HIGH')).toBe(false);

      delete process.env.ALERTS_ENABLED;
    });
  });
});
