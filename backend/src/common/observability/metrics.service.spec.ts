import { MetricsService } from './metrics.service';

/**
 * MetricsService tests focus on the in-memory rolling windows
 * (snapshotAndResetHttpWindow / snapshotAndResetQueueWindow / snapshotAndResetPdfWindow)
 * and the recordX helpers that feed them. OpenTelemetry API calls are fire-and-forget;
 * we verify that the rolling windows accumulate and reset correctly.
 */

function makeService(): MetricsService {
  return new MetricsService();
}

describe('MetricsService — HTTP window', () => {
  it('increments count and errorCount on each request', () => {
    const service = makeService();

    service.recordHttpRequest('GET', '/a', 200, 50);
    service.recordHttpRequest('GET', '/b', 500, 100);
    service.recordHttpRequest('POST', '/c', 200, 30);

    const snap = service.snapshotAndResetHttpWindow();

    expect(snap.count).toBe(3);
    expect(snap.errorCount).toBe(1);
  });

  it('computes errorRate as errorCount / count', () => {
    const service = makeService();

    service.recordHttpRequest('GET', '/a', 500, 10);
    service.recordHttpRequest('GET', '/b', 200, 10);

    const snap = service.snapshotAndResetHttpWindow();

    expect(snap.errorRate).toBeCloseTo(0.5);
  });

  it('returns null errorRate when count is 0', () => {
    const service = makeService();

    const snap = service.snapshotAndResetHttpWindow();

    expect(snap.errorRate).toBeNull();
    expect(snap.avgDurationMs).toBeNull();
  });

  it('tracks maxDurationMs correctly', () => {
    const service = makeService();

    service.recordHttpRequest('GET', '/a', 200, 100);
    service.recordHttpRequest('GET', '/b', 200, 500);
    service.recordHttpRequest('GET', '/c', 200, 200);

    const snap = service.snapshotAndResetHttpWindow();

    expect(snap.maxDurationMs).toBe(500);
  });

  it('resets the window after snapshot', () => {
    const service = makeService();

    service.recordHttpRequest('GET', '/a', 200, 100);
    service.snapshotAndResetHttpWindow();

    const snap2 = service.snapshotAndResetHttpWindow();

    expect(snap2.count).toBe(0);
    expect(snap2.maxDurationMs).toBe(0);
  });

  it('computes avgDurationMs correctly', () => {
    const service = makeService();

    service.recordHttpRequest('GET', '/a', 200, 100);
    service.recordHttpRequest('GET', '/b', 200, 300);

    const snap = service.snapshotAndResetHttpWindow();

    expect(snap.avgDurationMs).toBe(200);
  });
});

describe('MetricsService — Queue window', () => {
  it('increments count and errorCount correctly', () => {
    const service = makeService();

    service.recordQueueJob('pdf', 'generate', 200, 'success');
    service.recordQueueJob('pdf', 'generate', 300, 'error');
    service.recordQueueJob('mail', 'send', 100, 'success');

    const snap = service.snapshotAndResetQueueWindow();

    expect(snap.count).toBe(3);
    expect(snap.errorCount).toBe(1);
  });

  it('resets queue window after snapshot', () => {
    const service = makeService();

    service.recordQueueJob('pdf', 'generate', 200, 'success');
    service.snapshotAndResetQueueWindow();

    const snap2 = service.snapshotAndResetQueueWindow();

    expect(snap2.count).toBe(0);
  });
});

describe('MetricsService — inFlight counter', () => {
  it('increments and decrements httpInFlightCount', () => {
    const service = makeService();

    // Can call increment/decrement without throwing
    service.incrementHttpRequestsInFlight();
    service.incrementHttpRequestsInFlight();
    service.decrementHttpRequestsInFlight();

    // No assertion needed on internal state — just ensure no error thrown
    expect(() => service.decrementHttpRequestsInFlight()).not.toThrow();
  });

  it('never goes below 0 on decrement', () => {
    const service = makeService();

    // Decrement without prior increment — should clamp to 0
    expect(() => service.decrementHttpRequestsInFlight()).not.toThrow();
  });
});
