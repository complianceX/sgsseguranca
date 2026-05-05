import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import type { MetricsService } from '../common/observability/metrics.service';
import type { SecurityAuditService } from '../common/security/security-audit.service';
import type { ForensicTrailService } from '../forensic-trail/forensic-trail.service';
import type { PublicValidationGrantService } from '../common/services/public-validation-grant.service';
import type { DocumentRegistryService } from '../document-registry/document-registry.service';
import { PublicDdsValidationController } from './public-dds-validation.controller';

describe('PublicDdsValidationController', () => {
  let controller: PublicDdsValidationController;
  let documentRegistryService: Pick<
    DocumentRegistryService,
    'validatePublicCode'
  >;
  let metricsService: Pick<
    MetricsService,
    'recordPublicValidation' | 'recordPublicValidationSuspicious'
  >;
  let securityAudit: Pick<SecurityAuditService, 'emit' | 'bruteForceBlocked'>;
  let forensicTrail: Pick<ForensicTrailService, 'append'>;
  let publicValidationGrantService: Pick<
    PublicValidationGrantService,
    'assertActiveToken'
  >;

  beforeEach(() => {
    process.env.PUBLIC_VALIDATION_BLOCK_SUSPICIOUS_UA = 'false';
    delete process.env.PUBLIC_VALIDATION_THROTTLE_LIMIT;
    delete process.env.PUBLIC_VALIDATION_THROTTLE_TTL_MS;

    documentRegistryService = {
      validatePublicCode: jest.fn(),
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
    publicValidationGrantService = {
      assertActiveToken: jest.fn(),
    };

    controller = new PublicDdsValidationController(
      documentRegistryService as DocumentRegistryService,
      securityAudit as SecurityAuditService,
      metricsService as MetricsService,
      forensicTrail as ForensicTrailService,
      publicValidationGrantService as PublicValidationGrantService,
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
    (
      publicValidationGrantService.assertActiveToken as jest.Mock
    ).mockResolvedValue({
      jti: 'grant-1',
      code: 'DDS-2026-ABCD1234',
      companyId: 'tenant-1',
    });

    await expect(
      controller.validateByCode(
        { code: 'DDS-2026-ABCD1234', token: 'token-valido' },
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
    (
      publicValidationGrantService.assertActiveToken as jest.Mock
    ).mockRejectedValue(new Error('invalid_token'));

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
      null,
      'dds',
      'invalid_token',
    );
    expect(
      metricsService.recordPublicValidationSuspicious,
    ).toHaveBeenCalledWith('dds', 'bot_user_agent', null);
    expect(
      metricsService.recordPublicValidationSuspicious,
    ).toHaveBeenCalledWith('dds', 'invalid_token', null);
    expect(securityAudit.emit).toHaveBeenCalled();
    expect(forensicTrail.append).toHaveBeenCalled();
  });

  it('detecta multiple suspicious indicators e marca como bloqueado', async () => {
    process.env.PUBLIC_VALIDATION_BLOCK_SUSPICIOUS_UA = 'true';
    const newController = new PublicDdsValidationController(
      documentRegistryService as DocumentRegistryService,
      securityAudit as SecurityAuditService,
      metricsService as MetricsService,
      forensicTrail as ForensicTrailService,
      publicValidationGrantService as PublicValidationGrantService,
    );

    (documentRegistryService.validatePublicCode as jest.Mock).mockResolvedValue(
      {
        valid: true,
        code: 'DDS-2026-ABCD1234',
        dds: { tema: 'DDS' },
      },
    );

    await expect(
      newController.validateByCode(
        { code: 'DDS-2026-ABCD1234', token: 'token-ok' },
        makeRequest({
          headers: { 'user-agent': 'curl/7.0' },
          ip: '10.0.0.1',
        }),
      ),
    ).resolves.toMatchObject({
      valid: false,
      validation_security: {
        suspicious_request: true,
        blocked: true,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        suspicious_reasons: expect.arrayContaining(['bot_user_agent']),
      },
    });

    expect(securityAudit.bruteForceBlocked).toHaveBeenCalled();
  });

  it('valida codigo com brancos e rejeita', async () => {
    await expect(
      controller.validateByCode(
        { code: '   \n\t ', token: 'token' },
        makeRequest(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rastreia IP de fallback em request forensicamente', async () => {
    (documentRegistryService.validatePublicCode as jest.Mock).mockResolvedValue(
      {
        valid: true,
        code: 'DDS-2026-ABCD1234',
        dds: { tema: 'DDS' },
      },
    );
    (
      publicValidationGrantService.assertActiveToken as jest.Mock
    ).mockResolvedValue({
      jti: 'grant-1',
      code: 'DDS-2026-ABCD1234',
      companyId: 'tenant-1',
    });

    const request = makeRequest();
    Object.defineProperty(request, 'ip', {
      configurable: true,
      value: undefined,
    });

    await controller.validateByCode(
      { code: 'DDS-2026-ABCD1234', token: 'token' },
      request,
    );

    expect(forensicTrail.append).toHaveBeenCalledWith(
      expect.objectContaining({
        ip: '127.0.0.1',
      }),
    );
  });

  it('rastreia outcome success vs invalid vs blocked', async () => {
    (documentRegistryService.validatePublicCode as jest.Mock).mockResolvedValue(
      {
        valid: true,
        code: 'DDS-OK',
        dds: { tema: 'Valid DDS' },
      },
    );
    (
      publicValidationGrantService.assertActiveToken as jest.Mock
    ).mockResolvedValue({
      jti: 'grant-1',
      code: 'DDS-OK',
      companyId: 'tenant-1',
    });

    await controller.validateByCode(
      { code: 'DDS-OK', token: 'token' },
      makeRequest(),
    );

    expect(metricsService.recordPublicValidation).toHaveBeenCalledWith(
      'tenant-1',
      'dds',
      'success',
    );
  });
});
