import { Logger as TypeOrmLogger, QueryRunner } from 'typeorm';
import { Logger } from '@nestjs/common';

export class DatabaseLogger implements TypeOrmLogger {
  private readonly logger = new Logger('DatabaseLogger');

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

  private sanitizeParameters(parameters?: any[]): any[] | undefined {
    if (!parameters) return parameters;
    return parameters.map((p) => this.maskValue(p));
  }

  logQuery(_query: string, _parameters?: any[], _queryRunner?: QueryRunner) {
    // Optional: debug level logging
  }

  logQueryError(
    error: string | Error,
    query: string,
    parameters?: any[],
    _queryRunner?: QueryRunner,
  ) {
    this.logger.error({
      message: 'Query Failed',
      query,
      parameters: this.sanitizeParameters(parameters),
      error,
    });
  }

  logQuerySlow(
    time: number,
    query: string,
    parameters?: any[],
    _queryRunner?: QueryRunner,
  ) {
    this.logger.warn({
      type: 'SLOW_QUERY',
      query,
      duration: `${time}ms`,
      parameters: this.sanitizeParameters(parameters),
    });
  }

  logSchemaBuild(message: string, _queryRunner?: QueryRunner) {
    this.logger.debug(message);
  }

  logMigration(message: string, _queryRunner?: QueryRunner) {
    this.logger.log(message);
  }

  log(
    level: 'log' | 'info' | 'warn',
    message: any,
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
