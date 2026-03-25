import { applyDecorators, SetMetadata, UseInterceptors } from '@nestjs/common';
import { ForensicAuditInterceptor } from '../interceptors/forensic-audit.interceptor';

export const AUDIT_ACTION_METADATA_KEY = 'audit_action';
export const AUDIT_RESOURCE_METADATA_KEY = 'audit_resource';

export type AuditableAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'approve'
  | 'reject'
  | 'finalize'
  | 'role_change'
  | 'permission_change'
  | 'export'
  | 'ai_access';

export function AuditAction(action: AuditableAction, resourceType: string) {
  return applyDecorators(
    SetMetadata(AUDIT_ACTION_METADATA_KEY, action),
    SetMetadata(AUDIT_RESOURCE_METADATA_KEY, resourceType),
    UseInterceptors(ForensicAuditInterceptor),
  );
}
