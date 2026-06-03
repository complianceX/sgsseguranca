import { trace } from '@opentelemetry/api';
import { requestContextStorage } from '../middleware/request-context.middleware';
import { buildStructuredLogEntry } from './structured-winston';

describe('buildStructuredLogEntry', () => {
  it('mescla payloads estruturados e injeta request context quando faltarem campos', () => {
    const store = new Map<string, unknown>([
      ['requestId', 'req-123'],
      ['userId', 'user-123'],
      ['companyId', 'company-123'],
    ]);

    const entry = requestContextStorage.run(store, () =>
      buildStructuredLogEntry({
        level: 'info',
        timestamp: '2026-03-18T18:15:00.000Z',
        context: 'HTTP',
        service: 'wanderson-gandra-backend',
        environment: 'test',
        message: {
          event: 'login_success',
        },
      }),
    );

    expect(entry).toEqual(
      expect.objectContaining({
        timestamp: '2026-03-18T18:15:00.000Z',
        level: 'INFO',
        context: 'HTTP',
        service: 'wanderson-gandra-backend',
        environment: 'test',
        event: 'login_success',
        requestId: 'req-123',
        userId: 'user-123',
        companyId: 'company-123',
      }),
    );
  });

  it('propaga traceId e spanId quando existir span ativo', () => {
    const getSpanSpy = jest.spyOn(trace, 'getSpan').mockReturnValue({
      spanContext: () => ({
        traceId: 'trace-123',
        spanId: 'span-123',
        traceFlags: 1,
      }),
    } as ReturnType<typeof trace.getSpan>);

    const entry = buildStructuredLogEntry({
      level: 'warn',
      timestamp: '2026-03-18T18:16:00.000Z',
      context: 'Observability',
      message: 'telemetry running',
    });

    getSpanSpy.mockRestore();

    expect(entry).toEqual(
      expect.objectContaining({
        level: 'WARN',
        message: 'telemetry running',
        traceId: 'trace-123',
        spanId: 'span-123',
      }),
    );
  });
});
