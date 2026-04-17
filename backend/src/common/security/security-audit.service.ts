import { Injectable, Logger } from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import { ForensicTrailService } from '../../forensic-trail/forensic-trail.service';
import { RequestContext } from '../middleware/request-context.middleware';

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
  MFA_ACTIVATED = 'MFA_ACTIVATED',
  MFA_DISABLED = 'MFA_DISABLED',
  MFA_FAILED = 'MFA_FAILED',
  MFA_VERIFIED = 'MFA_VERIFIED',
  MFA_RECOVERY_CODE_USED = 'MFA_RECOVERY_CODE_USED',
  MFA_RECOVERY_CODES_REGENERATED = 'MFA_RECOVERY_CODES_REGENERATED',

  // Step-up authentication
  STEP_UP_ISSUED = 'STEP_UP_ISSUED',
  STEP_UP_VERIFIED = 'STEP_UP_VERIFIED',
  STEP_UP_FAILED = 'STEP_UP_FAILED',

  // Critical operations
  APPROVAL_DECISION = 'APPROVAL_DECISION',
  DELETION_INITIATED = 'DELETION_INITIATED',
  EXPORT_INITIATED = 'EXPORT_INITIATED',
  SIGNATURE_OPERATION = 'SIGNATURE_OPERATION',
  ROLE_CHANGED = 'ROLE_CHANGED',
  ADMIN_ACTION = 'ADMIN_ACTION',
  SENSITIVE_DOWNLOAD = 'SENSITIVE_DOWNLOAD',
  BRUTE_FORCE_BLOCKED = 'BRUTE_FORCE_BLOCKED',
  FORBIDDEN_SPIKE = 'FORBIDDEN_SPIKE',

  // Tenant isolation
  CROSS_TENANT_ATTEMPT = 'CROSS_TENANT_ATTEMPT',
  CROSS_TENANT_SPOOF = 'CROSS_TENANT_SPOOF',

  // Storage / documents
  PRESIGNED_URL_GENERATED = 'PRESIGNED_URL_GENERATED',
  PRESIGNED_URL_TENANT_MISMATCH = 'PRESIGNED_URL_TENANT_MISMATCH',

  // Sensitive data access
  SENSITIVE_DATA_READ = 'SENSITIVE_DATA_READ',
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

  constructor(
    private readonly tenantService: TenantService,
    private readonly forensicTrail: ForensicTrailService,
  ) {}

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

    void this.persistForensicEntry(entry);
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

  logout(userId?: string, ip?: string, userAgent?: string): void {
    this.emit({
      event: SecurityEventType.LOGOUT,
      severity: SecuritySeverity.INFO,
      userId,
      ip,
      userAgent: userAgent?.substring(0, 200),
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

  stepUpIssued(userId: string, reason: string, method?: string): void {
    this.emit({
      event: SecurityEventType.STEP_UP_ISSUED,
      severity: SecuritySeverity.INFO,
      userId,
      metadata: { reason, method },
    });
  }

  stepUpVerified(userId: string, reason?: string, method?: string): void {
    this.emit({
      event: SecurityEventType.STEP_UP_VERIFIED,
      severity: SecuritySeverity.INFO,
      userId,
      metadata: { reason, method },
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

  passwordChanged(userId: string): void {
    this.emit({
      event: SecurityEventType.PASSWORD_CHANGED,
      severity: SecuritySeverity.WARNING,
      userId,
    });
  }

  passwordReset(userId: string): void {
    this.emit({
      event: SecurityEventType.PASSWORD_RESET,
      severity: SecuritySeverity.WARNING,
      userId,
    });
  }

  mfaActivated(userId: string, method: string): void {
    this.emit({
      event: SecurityEventType.MFA_ACTIVATED,
      severity: SecuritySeverity.WARNING,
      userId,
      metadata: { method },
    });
  }

  mfaDisabled(userId: string, method: string): void {
    this.emit({
      event: SecurityEventType.MFA_DISABLED,
      severity: SecuritySeverity.HIGH,
      userId,
      metadata: { method },
    });
  }

  mfaVerificationFailed(userId: string, flow: string): void {
    this.emit({
      event: SecurityEventType.MFA_FAILED,
      severity: SecuritySeverity.WARNING,
      userId,
      metadata: { flow },
    });
  }

  mfaUsed(userId: string, method: string, flow: string): void {
    this.emit({
      event: SecurityEventType.MFA_VERIFIED,
      severity: SecuritySeverity.INFO,
      userId,
      metadata: { method, flow },
    });
  }

  mfaRecoveryCodeUsed(userId: string): void {
    this.emit({
      event: SecurityEventType.MFA_RECOVERY_CODE_USED,
      severity: SecuritySeverity.WARNING,
      userId,
    });
  }

  mfaRecoveryCodesRegenerated(userId: string): void {
    this.emit({
      event: SecurityEventType.MFA_RECOVERY_CODES_REGENERATED,
      severity: SecuritySeverity.HIGH,
      userId,
    });
  }

  roleChanged(userId: string, targetUserId: string, profileId: string): void {
    this.emit({
      event: SecurityEventType.ROLE_CHANGED,
      severity: SecuritySeverity.HIGH,
      userId,
      metadata: { targetUserId, profileId },
    });
  }

  adminAction(userId: string, action: string, entityId?: string): void {
    this.emit({
      event: SecurityEventType.ADMIN_ACTION,
      severity: SecuritySeverity.HIGH,
      userId,
      metadata: { action, entityId },
    });
  }

  sensitiveDownload(
    userId: string,
    module: string,
    entityId?: string,
    classification?: string,
  ): void {
    this.emit({
      event: SecurityEventType.SENSITIVE_DOWNLOAD,
      severity: SecuritySeverity.WARNING,
      userId,
      metadata: { module, entityId, classification },
    });
  }

  bruteForceBlocked(ip?: string, subject?: string): void {
    this.emit({
      event: SecurityEventType.BRUTE_FORCE_BLOCKED,
      severity: SecuritySeverity.HIGH,
      ip,
      metadata: { subject },
    });
  }

  tenantMismatch(
    userId: string | undefined,
    expectedTenant: string,
    actualTenant: string,
  ): void {
    this.emit({
      event: SecurityEventType.CROSS_TENANT_SPOOF,
      severity: SecuritySeverity.CRITICAL,
      userId,
      metadata: { expectedTenant, actualTenant },
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

  sensitiveDataRead(
    userId: string,
    resourceType: string,
    resourceId?: string,
    path?: string,
  ): void {
    this.emit({
      event: SecurityEventType.SENSITIVE_DATA_READ,
      severity: SecuritySeverity.INFO,
      userId,
      path,
      metadata: { resourceType, resourceId },
    });
  }

  private async persistForensicEntry(entry: SecurityEvent): Promise<void> {
    try {
      await this.forensicTrail.append({
        eventType: entry.event,
        module: 'security',
        entityId: entry.userId || entry.ip || 'anonymous',
        companyId: entry.companyId ?? null,
        userId: entry.userId ?? null,
        requestId: RequestContext.getRequestId() ?? null,
        ip: entry.ip ?? RequestContext.get('ip') ?? null,
        userAgent: entry.userAgent ?? RequestContext.get('userAgent') ?? null,
        metadata: this.sanitizeMetadata(entry.metadata),
        occurredAt: new Date(entry.timestamp),
      });
    } catch (error) {
      this.logger.error({
        event: 'security_audit_forensic_persist_failed',
        reason: error instanceof Error ? error.message : String(error),
        originalEvent: entry.event,
      });
    }
  }

  private sanitizeMetadata(
    metadata?: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    if (!metadata) {
      return undefined;
    }

    return Object.fromEntries(
      Object.entries(metadata).map(([key, value]) => {
        const normalizedKey = key.toLowerCase();
        if (
          normalizedKey.includes('token') ||
          normalizedKey.includes('password') ||
          normalizedKey.includes('secret') ||
          normalizedKey.includes('code')
        ) {
          return [key, '[redacted]'];
        }
        if (normalizedKey.includes('cpf') && typeof value === 'string') {
          return [key, `${value.slice(0, 3)}***`];
        }
        if (normalizedKey.includes('email') && typeof value === 'string') {
          const [local, domain] = value.split('@');
          return [
            key,
            domain ? `${local.slice(0, 2)}***@${domain}` : '[redacted]',
          ];
        }
        return [key, value];
      }),
    );
  }
}
