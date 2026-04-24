import { Repository } from 'typeorm';
import { AprMetric, AprMetricEventType } from '../entities/apr-metric.entity';
import { AprMetricsService } from './apr-metrics.service';

describe('AprMetricsService', () => {
  let service: AprMetricsService;
  let repo: { create: jest.Mock; save: jest.Mock };

  beforeEach(() => {
    repo = {
      create: jest.fn((input) => input),
      save: jest.fn(() => Promise.resolve()),
    };
    service = new AprMetricsService(repo as unknown as Repository<AprMetric>);
  });

  it('persiste evento de métrica via setImmediate', async () => {
    service.record({
      aprId: 'apr-1',
      tenantId: 'company-1',
      eventType: AprMetricEventType.APR_OPENED,
      durationMs: 120,
    });

    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        aprId: 'apr-1',
        tenantId: 'company-1',
        eventType: AprMetricEventType.APR_OPENED,
        durationMs: 120,
        errorStep: null,
        metadata: null,
      }),
    );
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('usa null para campos opcionais ausentes', async () => {
    service.record({
      aprId: 'apr-2',
      eventType: AprMetricEventType.APR_STEP_ERROR,
    });

    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        aprId: 'apr-2',
        tenantId: null,
        durationMs: null,
        errorStep: null,
        metadata: null,
      }),
    );
  });

  it('silencia erros de persistência sem lançar exceção', async () => {
    repo.save.mockRejectedValue(new Error('db error'));

    service.record({
      aprId: 'apr-3',
      eventType: AprMetricEventType.APR_PDF_GENERATED,
    });

    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(repo.save).toHaveBeenCalledTimes(1);
  });
});
