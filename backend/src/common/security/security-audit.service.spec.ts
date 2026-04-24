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
    const forensicTrail = {
      append: jest.fn().mockResolvedValue({}),
    } as unknown as jest.Mocked<ForensicTrailService>;
    const service = new SecurityAuditService(tenantService, forensicTrail);

    service.mfaVerificationFailed('user-1', 'bootstrap', 'company-1');
    await Promise.resolve();

    expect(forensicTrail.append).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: SecurityEventType.MFA_FAILED,
        companyId: 'company-1',
        userId: 'user-1',
        metadata: { flow: 'bootstrap' },
      }),
    );
  });
});
