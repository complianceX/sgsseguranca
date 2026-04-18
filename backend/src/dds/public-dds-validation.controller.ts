import {
  BadRequestException,
  Controller,
  Get,
  Logger,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { TenantOptional } from '../common/decorators/tenant-optional.decorator';
import { PublicValidationQueryDto } from '../common/dto/public-validation-query.dto';
import { MetricsService } from '../common/observability/metrics.service';
import { verifyValidationToken } from '../common/security/validation-token.util';
import { ForensicTrailService } from '../forensic-trail/forensic-trail.service';
import {
  getPublicValidationThrottleLimit,
  getPublicValidationThrottleTtlMs,
  isPublicValidationBotBlockingEnabled,
  isPublicValidationContractLoggingEnabled,
  isPublicValidationLegacyCompatEnabled,
} from '../common/security/public-validation.config';
import {
  SecurityAuditService,
  SecurityEventType,
  SecuritySeverity,
} from '../common/security/security-audit.service';
import { DocumentRegistryService } from '../document-registry/document-registry.service';

type SuspiciousReason =
  | 'bot_user_agent'
  | 'missing_user_agent'
  | 'invalid_token'
  | 'code_mismatch'
  | 'legacy_without_token';

type ValidationSecurityPayload = {
  request_tracked: true;
  token_protected: boolean;
  suspicious_request: boolean;
  suspicious_reasons: SuspiciousReason[];
  rate_limit: string;
  portal: 'dds_public_validation';
  blocked: boolean;
};

@Controller('public/dds')
export class PublicDdsValidationController {
  private readonly logger = new Logger(PublicDdsValidationController.name);
  private static readonly SUSPICIOUS_USER_AGENTS = [
    'bot',
    'crawler',
    'spider',
    'curl',
    'wget',
    'python-requests',
    'postman',
    'insomnia',
    'okhttp',
    'powershell',
  ];

  constructor(
    private readonly documentRegistryService: DocumentRegistryService,
    private readonly securityAudit: SecurityAuditService,
    private readonly metricsService: MetricsService,
    private readonly forensicTrail: ForensicTrailService,
  ) {}

  @Get('validate')
  @Public()
  @TenantOptional()
  @Throttle({
    default: {
      limit: getPublicValidationThrottleLimit(),
      ttl: getPublicValidationThrottleTtlMs(),
    },
  })
  async validateByCode(
    @Query() query: PublicValidationQueryDto,
    @Req() req: Request,
  ) {
    const { code, token } = query;
    if (!code || !code.trim()) {
      this.metricsService.recordPublicValidation(null, 'dds', 'invalid_code');
      throw new BadRequestException('Código ausente.');
    }

    const normalizedCode = code.trim().toUpperCase();
    const resolvedScope =
      await this.documentRegistryService.resolvePublicCodeScope({
        code: normalizedCode,
        expectedModule: 'dds',
      });
    const resolvedCompanyId = resolvedScope?.companyId ?? null;
    const suspiciousReasons = this.detectSuspiciousRequest(req);
    const baseSecurityPayload = this.buildSecurityPayload(
      token,
      suspiciousReasons,
    );
    const ip = this.getRequestIp(req);
    const userAgent = this.getRequestUserAgent(req);

    if (
      baseSecurityPayload.suspicious_request &&
      isPublicValidationBotBlockingEnabled() &&
      suspiciousReasons.includes('bot_user_agent')
    ) {
      this.metricsService.recordPublicValidation(
        resolvedCompanyId,
        'dds',
        'blocked',
      );
      this.recordSuspiciousSignals(suspiciousReasons, resolvedCompanyId);
      this.securityAudit.bruteForceBlocked(
        ip ?? undefined,
        'dds_public_validation_bot',
      );
      await this.persistValidationTrace({
        code: normalizedCode,
        companyId: resolvedCompanyId,
        outcome: 'blocked',
        suspiciousReasons,
        blocked: true,
        tokenProtected: Boolean(token?.trim()),
        req,
      });

      return {
        valid: false,
        code: normalizedCode,
        message: 'Validação indisponível para esta origem.',
        validation_security: {
          ...baseSecurityPayload,
          blocked: true,
        },
      };
    }

    if (!token || !token.trim()) {
      if (!isPublicValidationLegacyCompatEnabled()) {
        this.metricsService.recordPublicValidation(
          resolvedCompanyId,
          'dds',
          'invalid_token',
        );
        this.recordSuspiciousSignals(
          ['legacy_without_token'],
          resolvedCompanyId,
        );
        throw new BadRequestException('Token de validação ausente.');
      }

      if (isPublicValidationContractLoggingEnabled()) {
        this.logger.warn({
          event: 'public_validation_legacy_contract',
          route: '/public/dds/validate',
          codePrefix: normalizedCode.slice(0, 12),
        });
      }

      this.metricsService.recordPublicValidation(null, 'dds', 'legacy');
      const legacyReasons = this.mergeSuspiciousReasons(
        suspiciousReasons,
        'legacy_without_token',
      );
      this.recordSuspiciousSignals(legacyReasons, resolvedCompanyId);
      this.securityAudit.emit({
        event: SecurityEventType.SENSITIVE_DATA_READ,
        severity: SecuritySeverity.WARNING,
        companyId: resolvedCompanyId,
        ip,
        userAgent,
        method: req.method,
        path: req.originalUrl ?? req.url,
        metadata: {
          module: 'dds',
          reason: 'legacy_without_token',
          codePrefix: normalizedCode.slice(0, 12),
        },
      });

      const result =
        await this.documentRegistryService.validateLegacyPublicCode({
          code: normalizedCode,
          expectedModule: 'dds',
        });
      await this.persistValidationTrace({
        code: normalizedCode,
        companyId: resolvedCompanyId,
        outcome: 'legacy',
        suspiciousReasons: legacyReasons,
        blocked: false,
        tokenProtected: false,
        req,
      });

      return {
        ...result,
        validation_security: {
          ...baseSecurityPayload,
          suspicious_request: true,
          suspicious_reasons: legacyReasons,
        },
      };
    }

    let payload: { code: string; companyId: string };
    try {
      payload = verifyValidationToken(token.trim());
    } catch {
      this.metricsService.recordPublicValidation(
        resolvedCompanyId,
        'dds',
        'invalid_token',
      );
      const invalidReasons = this.mergeSuspiciousReasons(
        suspiciousReasons,
        'invalid_token',
      );
      this.recordSuspiciousSignals(invalidReasons, resolvedCompanyId);
      this.securityAudit.emit({
        event: SecurityEventType.BRUTE_FORCE_BLOCKED,
        severity: SecuritySeverity.WARNING,
        companyId: resolvedCompanyId,
        ip,
        userAgent,
        method: req.method,
        path: req.originalUrl ?? req.url,
        metadata: {
          module: 'dds',
          reason: 'invalid_token',
          codePrefix: normalizedCode.slice(0, 12),
        },
      });
      await this.persistValidationTrace({
        code: normalizedCode,
        companyId: resolvedCompanyId,
        outcome: 'invalid_token',
        suspiciousReasons: invalidReasons,
        blocked: false,
        tokenProtected: true,
        req,
      });

      return {
        valid: false,
        code: normalizedCode,
        message: 'Código inválido ou expirado.',
        validation_security: {
          ...baseSecurityPayload,
          suspicious_request: true,
          suspicious_reasons: invalidReasons,
        },
      };
    }

    if (payload.code.toUpperCase() !== normalizedCode) {
      this.metricsService.recordPublicValidation(
        payload.companyId,
        'dds',
        'module_mismatch',
      );
      const mismatchReasons = this.mergeSuspiciousReasons(
        suspiciousReasons,
        'code_mismatch',
      );
      this.recordSuspiciousSignals(mismatchReasons, payload.companyId);
      this.securityAudit.emit({
        event: SecurityEventType.BRUTE_FORCE_BLOCKED,
        severity: SecuritySeverity.WARNING,
        companyId: payload.companyId,
        ip,
        userAgent,
        method: req.method,
        path: req.originalUrl ?? req.url,
        metadata: {
          module: 'dds',
          reason: 'code_mismatch',
          codePrefix: normalizedCode.slice(0, 12),
        },
      });
      await this.persistValidationTrace({
        code: normalizedCode,
        companyId: payload.companyId,
        outcome: 'module_mismatch',
        suspiciousReasons: mismatchReasons,
        blocked: false,
        tokenProtected: true,
        req,
      });

      return {
        valid: false,
        code: normalizedCode,
        message: 'Código inválido ou expirado.',
        validation_security: {
          ...baseSecurityPayload,
          suspicious_request: true,
          suspicious_reasons: mismatchReasons,
        },
      };
    }

    this.metricsService.recordPublicValidation(
      payload.companyId,
      'dds',
      'success',
    );
    if (suspiciousReasons.length > 0) {
      this.recordSuspiciousSignals(suspiciousReasons, payload.companyId);
      this.securityAudit.emit({
        event: SecurityEventType.SENSITIVE_DATA_READ,
        severity: SecuritySeverity.WARNING,
        companyId: payload.companyId,
        ip,
        userAgent,
        method: req.method,
        path: req.originalUrl ?? req.url,
        metadata: {
          module: 'dds',
          reason: suspiciousReasons.join(','),
          codePrefix: normalizedCode.slice(0, 12),
        },
      });
    }

    const result = await this.documentRegistryService.validatePublicCode({
      code: normalizedCode,
      companyId: payload.companyId,
      expectedModule: 'dds',
    });
    await this.persistValidationTrace({
      code: normalizedCode,
      companyId: payload.companyId,
      outcome: 'success',
      suspiciousReasons,
      blocked: false,
      tokenProtected: true,
      req,
    });

    return {
      ...result,
      validation_security: baseSecurityPayload,
    };
  }

  private buildSecurityPayload(
    token: string | undefined,
    suspiciousReasons: SuspiciousReason[],
  ): ValidationSecurityPayload {
    const limit = getPublicValidationThrottleLimit();
    const ttlMs = getPublicValidationThrottleTtlMs();
    const ttlSeconds = Math.max(1, Math.round(ttlMs / 1000));

    return {
      request_tracked: true,
      token_protected: Boolean(token?.trim()),
      suspicious_request: suspiciousReasons.length > 0,
      suspicious_reasons: [...suspiciousReasons],
      rate_limit: `${limit}/${ttlSeconds}s`,
      portal: 'dds_public_validation',
      blocked: false,
    };
  }

  private recordSuspiciousSignals(
    reasons: SuspiciousReason[],
    companyId: string | null | undefined,
  ) {
    for (const reason of reasons) {
      this.metricsService.recordPublicValidationSuspicious(
        'dds',
        reason,
        companyId,
      );
    }
  }

  private mergeSuspiciousReasons(
    existing: SuspiciousReason[],
    reason: SuspiciousReason,
  ): SuspiciousReason[] {
    return Array.from(new Set([...existing, reason]));
  }

  private detectSuspiciousRequest(req: Request): SuspiciousReason[] {
    const userAgent = this.getRequestUserAgent(req);
    const reasons: SuspiciousReason[] = [];

    if (!userAgent) {
      reasons.push('missing_user_agent');
      return reasons;
    }

    const normalizedUserAgent = userAgent.toLowerCase();
    if (
      PublicDdsValidationController.SUSPICIOUS_USER_AGENTS.some((token) =>
        normalizedUserAgent.includes(token),
      )
    ) {
      reasons.push('bot_user_agent');
    }

    return reasons;
  }

  private getRequestIp(req: Request): string | null {
    return req.ip ?? req.socket?.remoteAddress ?? null;
  }

  private getRequestUserAgent(req: Request): string | null {
    const value = req.headers['user-agent'];
    if (typeof value !== 'string' || value.trim().length === 0) {
      return null;
    }

    return value.trim().slice(0, 200);
  }

  private async persistValidationTrace(input: {
    code: string;
    companyId: string | null;
    outcome:
      | 'success'
      | 'legacy'
      | 'invalid_token'
      | 'module_mismatch'
      | 'blocked';
    suspiciousReasons: SuspiciousReason[];
    blocked: boolean;
    tokenProtected: boolean;
    req: Request;
  }) {
    try {
      await this.forensicTrail.append({
        eventType: 'PUBLIC_VALIDATION_ATTEMPT',
        module: 'dds_public_validation',
        entityId: input.code,
        companyId: input.companyId,
        ip: this.getRequestIp(input.req),
        userAgent: this.getRequestUserAgent(input.req),
        metadata: {
          document_ref: input.code,
          outcome: input.outcome,
          suspicious: input.suspiciousReasons.length > 0,
          reasons: input.suspiciousReasons,
          blocked: input.blocked,
          token_protected: input.tokenProtected,
          source: 'public_dds_validate',
        },
      });
    } catch (error) {
      this.logger.warn({
        event: 'dds_public_validation_trace_failed',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
