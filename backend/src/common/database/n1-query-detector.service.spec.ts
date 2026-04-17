import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { N1QueryDetectorService } from './n1-query-detector.service';

describe('N1QueryDetectorService', () => {
  const makeConfig = (overrides: Record<string, unknown> = {}) =>
    ({
      get: jest.fn((key: string, defaultValue?: unknown) => {
        const config: Record<string, unknown> = {
          N1_QUERY_DETECTION_ENABLED: true,
          N1_QUERY_THRESHOLD: 5,
          N1_SLOW_QUERY_THRESHOLD: 100,
          N1_MAX_QUERIES_IN_MEMORY: 1000,
          ...overrides,
        };
        return key in config ? config[key] : defaultValue;
      }),
    }) as unknown as jest.Mocked<ConfigService>;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('deve inicializar e registrar status', () => {
    const configService = makeConfig({ N1_QUERY_DETECTION_ENABLED: true });
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();

    const service = new N1QueryDetectorService(configService);
    service.onModuleInit();

    expect(logSpy).toHaveBeenCalledWith('N+1 Query Detection: ENABLED');
  });

  it('deve ficar inerte quando desabilitado', () => {
    const configService = makeConfig({ N1_QUERY_DETECTION_ENABLED: false });
    const service = new N1QueryDetectorService(configService);

    service.logQuery('SELECT 1', [], 10);
    const report = service.analyzeQueries();

    expect(report.totalQueries).toBe(0);
    expect(report.uniquePatterns).toBe(0);
    expect(report.suspects).toHaveLength(0);
  });

  it('deve detectar padrão repetido e emitir warn ao atingir o threshold', () => {
    const configService = makeConfig({
      N1_QUERY_DETECTION_ENABLED: true,
      N1_QUERY_THRESHOLD: 3,
    });
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const service = new N1QueryDetectorService(configService);

    service.logQuery('SELECT * FROM users WHERE id = 1', [], 50);
    service.logQuery('SELECT * FROM users WHERE id = 2', [], 50);
    service.logQuery('SELECT * FROM users WHERE id = 3', [], 50);

    const report = service.analyzeQueries();
    expect(report.suspects).toHaveLength(1);
    expect(report.suspects[0].count).toBe(3);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'n1_query_detected' }),
    );
  });

  it('deve resetar no destroy', () => {
    const configService = makeConfig({ N1_QUERY_DETECTION_ENABLED: true });
    const service = new N1QueryDetectorService(configService);

    service.logQuery('SELECT 1', [], 5);
    expect(service.analyzeQueries().totalQueries).toBe(1);

    service.onModuleDestroy();
    expect(service.analyzeQueries().totalQueries).toBe(0);
  });
});
