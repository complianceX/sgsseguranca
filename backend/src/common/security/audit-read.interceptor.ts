import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import type { Request } from 'express';
import { SecurityAuditService } from './security-audit.service';
import { AUDIT_READ_KEY } from './audit-read.decorator';

/**
 * Interceptor global que emite evento de auditoria SENSITIVE_DATA_READ
 * sempre que um endpoint decorado com @AuditRead() é acessado com sucesso.
 *
 * Registrado como APP_INTERCEPTOR em AppModule.
 * Ativo apenas quando o decorator @AuditRead() está presente no handler ou controller.
 */
@Injectable()
export class AuditReadInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly securityAudit: SecurityAuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const resourceType = this.reflector.getAllAndOverride<string | undefined>(
      AUDIT_READ_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!resourceType) {
      return next.handle();
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: { userId?: string } }>();

    const userId = request.user?.userId;

    return next.handle().pipe(
      tap(() => {
        if (!userId) return;

        const resourceId =
          (request.params?.id as string | undefined) ||
          (request.params?.uuid as string | undefined);

        this.securityAudit.sensitiveDataRead(
          userId,
          resourceType,
          resourceId,
          request.path,
        );
      }),
    );
  }
}
