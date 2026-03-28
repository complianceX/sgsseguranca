import { Injectable, Logger } from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';

export enum SecurityEventType {
  // Authentication lifecycle
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILED = 'LOGIN_FAILED',
  LOGOUT = 'LOGOUT',
  TOKEN_REFRESH = 'TOKEN_REFRESH',
  TOKEN_REUSE_DETECTED = 'TOKEN_REUSE_DETECTED',
  SESSION_EVICTED = 'SESSION_EVICTED',
  SESSION_REVOKED = 'SESSION_REVOKED',
  ALL_SESSIONS_REVOKED = 'ALL_SESSIONS_REVOKED',
  PASSWORD_CHANGED = 'PASSWORD_CHANGED',
  PASSWORD_RESET = 'PASSWORD_RESET',

  // Step-up authentication
  STEP_UP_ISSUED = 'STEP_UP_ISSUED',
  STEP_UP_VERIFIED = 'STEP_UP_VERIFIED',
  STEP_UP_FAILED = 'STEP_UP_FAILED',

  // Critical operations
  APPROVAL_DECISION = 'APPROVAL_DECISION',
  DELETION_INITIATED = 'DELETION_INITIATED',
  EXPORT_INITIATED = 'EXPORT_INITIATED',
  SIGNATURE_OPERATION = 'SIGNATURE_OPERATION',

  // Tenant isolation
  CROSS_TENANT_ATTEMPT = 'CROSS_TENANT_ATTEMPT',
  CROSS_TENANT_SPOOF = 'CROSS_TENANT_SPOOF',

  // Storage / documents
  PRESIGNED_URL_GENERATED = 'PRESIGNED_URL_GENERATED',
  PRESIGNED_URL_TENANT_MISMATCH = 'PRESIGNED_URL_TENANT_MISMATCH',
}

export enum SecuritySeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export interface SecurityEvent {
  event: SecurityEventType;
  severity: SecuritySeverity;
  userId?: string | null;
  companyId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  method?: string | null;
  path?: string | null;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

@Injectable()
export class SecurityAuditService {
  private readonly logger = new Logger('SecurityAudit');

  constructor(private readonly tenantService: TenantService) {}

  emit(event: Omit<SecurityEvent, 'timestamp'>): void {
    const entry: SecurityEvent = {
      ...event,
      companyId: event.companyId ?? this.tenantService.getTenantId() ?? null,
      timestamp: new Date().toISOString(),
    };

    // Structured log — ingested by Winston → file + Prometheus labels
    if (
      entry.severity === SecuritySeverity.CRITICAL ||
      entry.severity === SecuritySeverity.HIGH
    ) {
      this.logger.warn(entry);
    } else {
      this.logger.log(entry);
    }
  }

  loginSuccess(userId: string, ip?: string, userAgent?: string): void {
    this.emit({
      event: SecurityEventType.LOGIN_SUCCESS,
      severity: SecuritySeverity.INFO,
      userId,
      ip,
      userAgent: userAgent?.substring(0, 200),
    });
  }

  loginFailed(
    cpf: string,
    ip?: string,
    reason?: string,
    userAgent?: string,
  ): void {
    this.emit({
      event: SecurityEventType.LOGIN_FAILED,
      severity: SecuritySeverity.WARNING,
      ip,
      userAgent: userAgent?.substring(0, 200),
      metadata: { cpfPrefix: cpf.substring(0, 3), reason },
    });
  }

  tokenRefresh(userId: string, ip?: string): void {
    this.emit({
      event: SecurityEventType.TOKEN_REFRESH,
      severity: SecuritySeverity.INFO,
      userId,
      ip,
    });
  }

  tokenReuseDetected(userId: string, ip?: string, userAgent?: string): void {
    this.emit({
      event: SecurityEventType.TOKEN_REUSE_DETECTED,
      severity: SecuritySeverity.CRITICAL,
      userId,
      ip,
      userAgent: userAgent?.substring(0, 200),
      metadata: {
        action: 'ALL_TOKENS_REVOKED',
        reason:
          'Possible session hijacking — refresh token replayed after rotation',
      },
    });
  }

  sessionRevoked(userId: string, sessionId: string, revokedBy: string): void {
    this.emit({
      event: SecurityEventType.SESSION_REVOKED,
      severity: SecuritySeverity.INFO,
      userId,
      metadata: { sessionId, revokedBy },
    });
  }

  stepUpIssued(userId: string, reason: string): void {
    this.emit({
      event: SecurityEventType.STEP_UP_ISSUED,
      severity: SecuritySeverity.INFO,
      userId,
      metadata: { reason },
    });
  }

  stepUpVerified(userId: string): void {
    this.emit({
      event: SecurityEventType.STEP_UP_VERIFIED,
      severity: SecuritySeverity.INFO,
      userId,
    });
  }

  stepUpFailed(userId: string, reason: string): void {
    this.emit({
      event: SecurityEventType.STEP_UP_FAILED,
      severity: SecuritySeverity.WARNING,
      userId,
      metadata: { reason },
    });
  }

  approvalDecision(
    userId: string,
    module: string,
    entityId: string,
    decision: 'approve' | 'reject' | 'finalize',
    reason?: string,
  ): void {
    this.emit({
      event: SecurityEventType.APPROVAL_DECISION,
      severity: SecuritySeverity.INFO,
      userId,
      metadata: { module, entityId, decision, reason },
    });
  }

  deletionInitiated(userId: string, module: string, entityId: string): void {
    this.emit({
      event: SecurityEventType.DELETION_INITIATED,
      severity: SecuritySeverity.WARNING,
      userId,
      metadata: { module, entityId },
    });
  }

  exportInitiated(userId: string, module: string, format: string): void {
    this.emit({
      event: SecurityEventType.EXPORT_INITIATED,
      severity: SecuritySeverity.INFO,
      userId,
      metadata: { module, format },
    });
  }

  presignedUrlTenantMismatch(
    userId: string,
    expectedTenant: string,
    fileKeyTenant: string,
    fileKey: string,
  ): void {
    this.emit({
      event: SecurityEventType.PRESIGNED_URL_TENANT_MISMATCH,
      severity: SecuritySeverity.CRITICAL,
      userId,
      metadata: {
        expectedTenant,
        fileKeyTenant,
        fileKeyPrefix: fileKey.substring(0, 60),
      },
    });
  }
}
