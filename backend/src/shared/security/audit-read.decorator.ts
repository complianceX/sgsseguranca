import { SetMetadata } from '@nestjs/common';

export const AUDIT_READ_KEY = 'audit_read_resource';

/**
 * Marca um endpoint GET como acesso a dados sensíveis.
 * O AuditReadInterceptor captura a chamada e emite um evento SENSITIVE_DATA_READ
 * no SecurityAuditService, que persiste na forensic trail.
 *
 * Uso:
 *   @AuditRead('medical_exam')
 *   @Get(':id')
 *   findOne(@Param('id') id: string) { ... }
 */
export const AuditRead = (resourceType: string) =>
  SetMetadata(AUDIT_READ_KEY, resourceType);
