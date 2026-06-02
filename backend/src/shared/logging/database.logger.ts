import { Logger as TypeOrmLogger, QueryRunner } from 'typeorm';
import { Logger } from '@nestjs/common';
import { N1QueryDetectorService } from '../database/n1-query-detector.service';

export class DatabaseLogger implements TypeOrmLogger {
  private readonly logger = new Logger('DatabaseLogger');
  private n1Detector?: N1QueryDetectorService;

  setN1Detector(detector: N1QueryDetectorService) {
    this.n1Detector = detector;
  }

  private truncateQuery(query: string): string {
    const trimmed = query.trim();
    return trimmed.length > 2000 ? `${trimmed.slice(0, 2000)}…` : trimmed;
  }

  private maskValue(raw: unknown): unknown {
    if (typeof raw !== 'string') return raw;

    const trimmed = raw.trim();
    if (!trimmed) return trimmed;

    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      const [local, domain] = trimmed.split('@');
      const first = local?.[0] ?? '*';
      return `${first}***@${domain}`;
    }

    const digits = trimmed.replace(/\D/g, '');
    if (digits.length === 11) {
      return `${digits.slice(0, 3)}.***.***-**`;
    }

    return trimmed.length > 200 ? `${trimmed.slice(0, 200)}…` : trimmed;
  }

  private sanitizeParameters(parameters?: unknown[]): unknown[] | undefined {
    if (!parameters) return parameters;
    return parameters.map((p) => this.maskValue(p));
  }

  private serializeError(error: string | Error): Record<string, unknown> {
    if (typeof error === 'string') {
      return { message: error };
    }

    const payload: Record<string, unknown> = {
      message: error.message,
      errorName: error.name,
    };

    const maybeCode = (error as Error & { code?: unknown }).code;
    if (typeof maybeCode === 'string' || typeof maybeCode === 'number') {
      payload.code = maybeCode;
    }

    if (error.stack) {
      payload.stack = error.stack;
    }

    return payload;
  }

  logQuery(query: string, parameters?: unknown[], _queryRunner?: QueryRunner) {
    if (this.n1Detector) {
      this.n1Detector.logQuery(query, parameters);
    }
  }

  logQueryError(
    error: string | Error,
    query: string,
    parameters?: unknown[],
    _queryRunner?: QueryRunner,
  ) {
    this.logger.error({
      event: 'db_query_failed',
      query: this.truncateQuery(query),
      parameters: this.sanitizeParameters(parameters),
      error: this.serializeError(error),
    });
  }

  logQuerySlow(
    time: number,
    query: string,
    parameters?: unknown[],
    _queryRunner?: QueryRunner,
  ) {
    if (this.n1Detector) {
      this.n1Detector.logQuery(query, parameters, time);
    }
    this.logger.warn({
      event: 'db_slow_query',
      query: this.truncateQuery(query),
      durationMs: time,
      parameters: this.sanitizeParameters(parameters),
    });
  }

  logSchemaBuild(message: string, _queryRunner?: QueryRunner) {
    this.logger.debug({ event: 'db_schema_build', message });
  }

  logMigration(message: string, _queryRunner?: QueryRunner) {
    this.logger.log({ event: 'db_migration', message });
  }

  log(
    level: 'log' | 'info' | 'warn',
    message: unknown,
    _queryRunner?: QueryRunner,
  ) {
    switch (level) {
      case 'log':
      case 'info':
        this.logger.log(message);
        break;
      case 'warn':
        this.logger.warn(message);
        break;
    }
  }
}
