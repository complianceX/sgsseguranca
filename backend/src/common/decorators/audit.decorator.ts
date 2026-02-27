import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../audit/enums/audit-action.enum';
import { RequestContext } from '../middleware/request-context.middleware';

export function Audit(entity: string, action: AuditAction) {
  return function (
    target: object,
    propertyName: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value as (
      ...args: any[]
    ) => Promise<unknown>;

    descriptor.value = async function (
      this: { auditService?: AuditService },
      ...args: any[]
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
              changes: args[0] as object, // Assuming DTO/payload is first arg
              ip: (RequestContext.get('ip') as string) || 'unknown',
              userAgent: RequestContext.get('userAgent') as string,
              companyId,
            });
          }
        } catch (error) {
          console.error('Failed to log audit:', error);
        }
      } else {
        console.warn(
          `AuditService not found in ${target.constructor.name}. Ensure it is injected as 'auditService'.`,
        );
      }

      return result;
    };

    return descriptor;
  };
}
