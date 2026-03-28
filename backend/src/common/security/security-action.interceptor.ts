import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import type { Request } from 'express';
import { SecurityAuditService } from './security-audit.service';

/**
 * Global interceptor that automatically emits security audit events for
 * critical operations based on HTTP method + route pattern.
 *
 * Detects:
 * - Workflow transitions (POST/PATCH .../approve|reject|finalize)
 * - Status transitions (PATCH .../status)
 * - Deletions (DELETE with entity ID)
 * - Excel/bundle exports (GET .../export/excel or .../weekly-bundle)
 *
 * This avoids modifying every controller individually while providing
 * comprehensive audit coverage for sensitive operations.
 */
@Injectable()
export class SecurityActionInterceptor implements NestInterceptor {
  constructor(private readonly securityAudit: SecurityAuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: { userId?: string } }>();
    const method = request.method;
    const routePath = String(
      (request.route as { path?: string } | undefined)?.path ?? request.path,
    );
    const userId = request.user?.userId;

    return next.handle().pipe(
      tap(() => {
        // Only log after successful completion
        if (!userId) return;

        if (method === 'DELETE' && routePath.includes(':id')) {
          const mod = this.extractModule(request.path);
          const entityId = String(request.params?.id || 'unknown');
          this.securityAudit.deletionInitiated(userId, mod, entityId);
        }

        if (method === 'POST' || method === 'PATCH') {
          const workflowMatch = routePath.match(
            /:id\/(approve|reject|finalize)$/,
          );
          if (workflowMatch) {
            const decision = workflowMatch[1] as
              | 'approve'
              | 'reject'
              | 'finalize';
            const mod = this.extractModule(request.path);
            const entityId = String(request.params?.id || 'unknown');
            const reason = (request.body as Record<string, unknown>)?.reason as
              | string
              | undefined;
            this.securityAudit.approvalDecision(
              userId,
              mod,
              entityId,
              decision,
              reason,
            );
          }
        }

        if (method === 'PATCH' && routePath.endsWith('/status')) {
          const mod = this.extractModule(request.path);
          const entityId = String(request.params?.id || 'unknown');
          const status = (request.body as Record<string, unknown>)?.status as
            | string
            | undefined;
          this.securityAudit.approvalDecision(
            userId,
            mod,
            entityId,
            'approve',
            `status_change: ${status || 'unknown'}`,
          );
        }

        if (
          method === 'GET' &&
          (routePath.includes('export/excel') ||
            routePath.includes('weekly-bundle'))
        ) {
          const mod = this.extractModule(request.path);
          const format = routePath.includes('excel') ? 'excel' : 'bundle';
          this.securityAudit.exportInitiated(userId, mod, format);
        }
      }),
    );
  }

  private extractModule(path: string): string {
    // Extract module name from URL path: /aprs/123/approve → aprs
    const segments = path.split('/').filter(Boolean);
    return segments[0] || 'unknown';
  }
}
