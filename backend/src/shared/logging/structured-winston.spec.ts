import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { trace } from '@opentelemetry/api';
import { requestContextStorage } from '../middleware/request-context.middleware';
import {
  buildStructuredLogEntry,
  buildStructuredLoggerOptions,
} from './structured-winston';

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

  it('usa SGS_TEMP_DIR para os arquivos em runtime não produtivo', () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousTempDir = process.env.SGS_TEMP_DIR;
    const tempDir = mkdtempSync(join(tmpdir(), 'sgs-structured-log-'));
    let options: ReturnType<typeof buildStructuredLoggerOptions> | undefined;

    process.env.NODE_ENV = 'staging';
    process.env.SGS_TEMP_DIR = tempDir;

    try {
      options = buildStructuredLoggerOptions('test-service');
      const transports = Array.isArray(options.transports)
        ? options.transports
        : [options.transports];
      const fileTransports = transports.slice(1);

      expect(fileTransports).toHaveLength(2);
      expect((fileTransports[0] as { dirname?: string }).dirname).toBe(
        join(tempDir, 'logs'),
      );
      expect((fileTransports[0] as { filename?: string }).filename).toBe(
        'error.log',
      );
      expect((fileTransports[1] as { dirname?: string }).dirname).toBe(
        join(tempDir, 'logs'),
      );
      expect((fileTransports[1] as { filename?: string }).filename).toBe(
        'combined.log',
      );
    } finally {
      const transports = options?.transports;
      const transportList = Array.isArray(transports)
        ? transports
        : transports
          ? [transports]
          : [];
      for (const transport of transportList) {
        transport.close?.();
      }
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousTempDir === undefined) delete process.env.SGS_TEMP_DIR;
      else process.env.SGS_TEMP_DIR = previousTempDir;
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
