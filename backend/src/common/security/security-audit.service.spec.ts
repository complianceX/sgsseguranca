import {
  SecurityAuditService,
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
});
