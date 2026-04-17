import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../audit/enums/audit-action.enum';
import { RequestContext } from '../middleware/request-context.middleware';
import { Logger } from '@nestjs/common';

const auditLogger = new Logger('AuditDecorator');
const getRequestContextString = (key: 'ip' | 'userAgent'): string | undefined =>
  RequestContext.get<string>(key);

const isAuditPayload = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export function Audit(entity: string, action: AuditAction) {
  return function (
    target: object,
    _propertyName: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value as (
      ...args: unknown[]
    ) => Promise<unknown>;

    descriptor.value = async function (
      this: { auditService?: AuditService },
      ...args: unknown[]
    ) {
      const result: unknown = await originalMethod.apply(this, args);

      // Log audit
      // We assume the service class has auditService injected
      const auditService = this.auditService;

      if (auditService) {
        try {
          const userId = RequestContext.getUserId();
          const companyId = RequestContext.getCompanyId();

          if (userId && companyId) {
            const resultObj = result as { id?: string } | null;
            await auditService.log({
              userId,
              action,
              entity,
              entityId: resultObj?.id || 'unknown',
              changes: isAuditPayload(args[0]) ? args[0] : null,
              ip: getRequestContextString('ip') ?? 'unknown',
              userAgent: getRequestContextString('userAgent'),
              companyId,
            });
          }
        } catch (error) {
          auditLogger.error({
            event: 'audit_log_failed',
            entity,
            action,
            error:
              error instanceof Error
                ? { message: error.message, stack: error.stack }
                : { message: String(error) },
          });
        }
      } else {
        auditLogger.warn({
          event: 'audit_service_missing',
          target: target.constructor.name,
          entity,
          action,
          message:
            "AuditService not found. Ensure it is injected as 'auditService'.",
        });
      }

      return result;
    };

    return descriptor;
  };
}
