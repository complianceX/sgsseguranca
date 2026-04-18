import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import type { MetricsService } from '../common/observability/metrics.service';
import type { SecurityAuditService } from '../common/security/security-audit.service';
import type { ForensicTrailService } from '../forensic-trail/forensic-trail.service';
import { signValidationToken } from '../common/security/validation-token.util';
import type { DocumentRegistryService } from '../document-registry/document-registry.service';
import { PublicDdsValidationController } from './public-dds-validation.controller';

describe('PublicDdsValidationController', () => {
  let controller: PublicDdsValidationController;
  let documentRegistryService: Pick<
    DocumentRegistryService,
    'validatePublicCode' | 'validateLegacyPublicCode' | 'resolvePublicCodeScope'
  >;
  let metricsService: Pick<
    MetricsService,
    'recordPublicValidation' | 'recordPublicValidationSuspicious'
  >;
  let securityAudit: Pick<SecurityAuditService, 'emit' | 'bruteForceBlocked'>;
  let forensicTrail: Pick<ForensicTrailService, 'append'>;

  beforeEach(() => {
    process.env.VALIDATION_TOKEN_SECRET = 'test-secret-test-secret-test-secret';
    process.env.PUBLIC_VALIDATION_LEGACY_COMPAT = 'false';
    process.env.PUBLIC_VALIDATION_BLOCK_SUSPICIOUS_UA = 'false';
    delete process.env.PUBLIC_VALIDATION_THROTTLE_LIMIT;
    delete process.env.PUBLIC_VALIDATION_THROTTLE_TTL_MS;

    documentRegistryService = {
      validatePublicCode: jest.fn(),
      validateLegacyPublicCode: jest.fn(),
      resolvePublicCodeScope: jest.fn().mockResolvedValue({
        companyId: 'tenant-1',
        module: 'dds',
      }),
    };
    metricsService = {
      recordPublicValidation: jest.fn(),
      recordPublicValidationSuspicious: jest.fn(),
    };
    securityAudit = {
      emit: jest.fn(),
      bruteForceBlocked: jest.fn(),
    };
    forensicTrail = {
      append: jest.fn().mockResolvedValue({}),
    };

    controller = new PublicDdsValidationController(
      documentRegistryService as DocumentRegistryService,
      securityAudit as SecurityAuditService,
      metricsService as MetricsService,
      forensicTrail as ForensicTrailService,
    );
  });

  function makeRequest(overrides?: Partial<Request>): Request {
    return {
      method: 'GET',
      url: '/public/dds/validate',
      originalUrl: '/public/dds/validate?code=DDS-2026-ABCD1234',
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' } as Request['socket'],
      headers: {
        'user-agent': 'Mozilla/5.0',
      },
      ...overrides,
    } as Request;
  }

  it('retorna o payload público premium do DDS governado', async () => {
    const validatePublicCodeMock =
      documentRegistryService.validatePublicCode as jest.Mock;
    validatePublicCodeMock.mockResolvedValue({
      valid: true,
      code: 'DDS-2026-ABCD1234',
      dds: {
        tema: 'DDS Trabalho em Altura',
      },
    });

    const token = signValidationToken({
      code: 'DDS-2026-ABCD1234',
      companyId: 'tenant-1',
    });

    await expect(
      controller.validateByCode(
        { code: 'DDS-2026-ABCD1234', token },
        makeRequest(),
      ),
    ).resolves.toEqual({
      valid: true,
      code: 'DDS-2026-ABCD1234',
      dds: {
        tema: 'DDS Trabalho em Altura',
      },
      validation_security: {
        request_tracked: true,
        token_protected: true,
        suspicious_request: false,
        suspicious_reasons: [],
        rate_limit: '3/60s',
        portal: 'dds_public_validation',
        blocked: false,
      },
    });

    expect(documentRegistryService.validatePublicCode).toHaveBeenCalledWith({
      code: 'DDS-2026-ABCD1234',
      companyId: 'tenant-1',
      expectedModule: 'dds',
    });
    expect(metricsService.recordPublicValidation).toHaveBeenCalledWith(
      'tenant-1',
      'dds',
      'success',
    );
    expect(forensicTrail.append).toHaveBeenCalled();
  });

  it('rejeita chamada sem código', async () => {
    await expect(
      controller.validateByCode({ code: '   ', token: 'token' }, makeRequest()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('marca token inválido como tentativa suspeita', async () => {
    await expect(
      controller.validateByCode(
        { code: 'DDS-2026-ABCD1234', token: 'token-invalido' },
        makeRequest({ headers: { 'user-agent': 'PostmanRuntime/7.0' } }),
      ),
    ).resolves.toEqual({
      valid: false,
      code: 'DDS-2026-ABCD1234',
      message: 'Código inválido ou expirado.',
      validation_security: {
        request_tracked: true,
        token_protected: true,
        suspicious_request: true,
        suspicious_reasons: ['bot_user_agent', 'invalid_token'],
        rate_limit: '3/60s',
        portal: 'dds_public_validation',
        blocked: false,
      },
    });

    expect(metricsService.recordPublicValidation).toHaveBeenCalledWith(
      'tenant-1',
      'dds',
      'invalid_token',
    );
    expect(
      metricsService.recordPublicValidationSuspicious,
    ).toHaveBeenCalledWith('dds', 'bot_user_agent', 'tenant-1');
    expect(
      metricsService.recordPublicValidationSuspicious,
    ).toHaveBeenCalledWith('dds', 'invalid_token', 'tenant-1');
    expect(securityAudit.emit).toHaveBeenCalled();
    expect(forensicTrail.append).toHaveBeenCalled();
  });
});
