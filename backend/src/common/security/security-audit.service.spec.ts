import {
  SecurityAuditService,
  SecuritySeverity,
  SecurityEventType,
} from './security-audit.service';
import { TenantService } from '../tenant/tenant.service';
import { ForensicTrailService } from '../../forensic-trail/forensic-trail.service';

describe('SecurityAuditService', () => {
  it('persiste eventos MFA com companyId explícito para respeitar RLS tenant-scoped', async () => {
    const tenantService = {
      getTenantId: jest.fn().mockReturnValue(null),
    } as unknown as jest.Mocked<TenantService>;
    const append = jest.fn().mockResolvedValue({});
    const forensicTrail = {
      append,
    } as unknown as jest.Mocked<ForensicTrailService>;
    const service = new SecurityAuditService(tenantService, forensicTrail);

    service.mfaVerificationFailed('user-1', 'bootstrap', 'company-1');
    await Promise.resolve();

    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: SecurityEventType.MFA_FAILED,
        companyId: 'company-1',
        userId: 'user-1',
        metadata: { flow: 'bootstrap' },
      }),
    );
  });

  it('não persiste evento forense sem companyId', async () => {
    const tenantService = {
      getTenantId: jest.fn().mockReturnValue(null),
    } as unknown as jest.Mocked<TenantService>;
    const append = jest.fn().mockResolvedValue({});
    const forensicTrail = {
      append,
    } as unknown as jest.Mocked<ForensicTrailService>;
    const service = new SecurityAuditService(tenantService, forensicTrail);

    service.loginFailed('12345678900', '127.0.0.1', 'invalid_credentials');
    await Promise.resolve();

    expect(append).not.toHaveBeenCalled();
  });

  it('sanitiza path de evento antes de registrar log estruturado', () => {
    const tenantService = {
      getTenantId: jest.fn().mockReturnValue('company-1'),
    } as unknown as jest.Mocked<TenantService>;
    const append = jest.fn().mockResolvedValue({});
    const forensicTrail = {
      append,
    } as unknown as jest.Mocked<ForensicTrailService>;
    const service = new SecurityAuditService(tenantService, forensicTrail);
    const loggerWarn = jest
      .spyOn(
        (service as unknown as { logger: { warn: jest.Mock } }).logger,
        'warn',
      )
      .mockImplementation(() => undefined);

    service.emit({
      event: SecurityEventType.CROSS_TENANT_SPOOF,
      severity: SecuritySeverity.HIGH,
      path: '/public/dds/signature/token-secreto?token=abc123&trace=1',
    });

    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/public/dds/signature/***REDACTED***',
      }),
    );
  });
});
