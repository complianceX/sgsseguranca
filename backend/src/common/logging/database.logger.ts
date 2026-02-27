import { Logger as TypeOrmLogger, QueryRunner } from 'typeorm';
import { Logger } from '@nestjs/common';

export class DatabaseLogger implements TypeOrmLogger {
  private readonly logger = new Logger('DatabaseLogger');

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
      parameters,
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
      parameters,
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
