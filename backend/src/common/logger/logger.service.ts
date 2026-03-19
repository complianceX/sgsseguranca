import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import * as winston from 'winston';
import { TenantService } from '../tenant/tenant.service';
import { createStructuredWinstonLogger } from '../logging/structured-winston';

@Injectable()
export class LoggerService implements NestLoggerService {
  private logger: winston.Logger;

  constructor() {
    this.logger = createStructuredWinstonLogger('wanderson-gandra-backend');
  }

  /** Injeta tenantId automaticamente via AsyncLocalStorage (sem DI). */
  private tenantMeta(): Record<string, string | undefined> {
    const tenantId = TenantService.currentTenantId();
    return tenantId ? { tenantId } : {};
  }

  log(message: string, context?: string, meta?: Record<string, any>) {
    this.logger.info(message, { context, ...this.tenantMeta(), ...meta });
  }

  error(
    message: string,
    trace?: string,
    context?: string,
    meta?: Record<string, any>,
  ) {
    this.logger.error(message, {
      context,
      trace,
      ...this.tenantMeta(),
      ...meta,
    });
  }

  warn(message: string, context?: string, meta?: Record<string, any>) {
    this.logger.warn(message, { context, ...this.tenantMeta(), ...meta });
  }

  debug(message: string, context?: string, meta?: Record<string, any>) {
    this.logger.debug(message, { context, ...this.tenantMeta(), ...meta });
  }

  verbose(message: string, context?: string, meta?: Record<string, any>) {
    this.logger.verbose(message, { context, ...this.tenantMeta(), ...meta });
  }
}
