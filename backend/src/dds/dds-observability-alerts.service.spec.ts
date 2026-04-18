import type { Repository } from 'typeorm';
import type { NotificationsService } from '../notifications/notifications.service';
import type { MailService } from '../mail/mail.service';
import type { DistributedLockService } from '../common/redis/distributed-lock.service';
import type { ForensicTrailService } from '../forensic-trail/forensic-trail.service';
import type { Company } from '../companies/entities/company.entity';
import type { User } from '../users/entities/user.entity';
import type { ForensicTrailEvent } from '../forensic-trail/entities/forensic-trail-event.entity';
import type { DdsObservabilityService } from './dds-observability.service';
import { DdsObservabilityAlertsService } from './dds-observability-alerts.service';

describe('DdsObservabilityAlertsService', () => {
  beforeEach(() => {
    process.env.DDS_ALERTS_SUSPICIOUS_THRESHOLD = '5';
    process.env.DDS_ALERTS_BLOCKED_THRESHOLD = '2';
    process.env.DDS_ALERTS_PENDING_GOVERNANCE_THRESHOLD = '3';
    process.env.DDS_ALERTS_PENDING_APPROVAL_THRESHOLD = '4';
    process.env.DDS_ALERTS_DEDUPE_MINUTES = '240';
  });

  it('gera preview com alertas ativos e fila de investigação', async () => {
    const observabilityService = {
      getOverview: jest.fn().mockResolvedValue({
        tenantScope: 'tenant',
        publicValidation: {
          suspiciousLast7d: 6,
          blockedLast7d: 2,
          topDocuments: [
            {
              documentRef: 'DDS-2026-ABCD1234',
              suspicious: 3,
              blocked: 1,
              lastSeenAt: '2026-04-18T10:00:00.000Z',
            },
          ],
        },
        portfolio: { pendingGovernance: 5 },
        approvals: { pending: 4 },
      }),
    } as unknown as DdsObservabilityService;

    const companyRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'company-1',
        email_contato: 'compliance@example.com',
        alert_settings: { recipients: ['sst@example.com'] },
      }),
    } as unknown as Repository<Company>;

    const userRepository = {
      createQueryBuilder: jest.fn().mockReturnValue({
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest
          .fn()
          .mockResolvedValue([{ id: 'user-1' }, { id: 'user-2' }]),
      }),
    } as unknown as Repository<User>;

    const service = new DdsObservabilityAlertsService(
      observabilityService,
      { createDeduped: jest.fn() } as unknown as NotificationsService,
      { sendMailSimple: jest.fn() } as unknown as MailService,
      {
        tryAcquire: jest.fn(),
        release: jest.fn(),
      } as unknown as DistributedLockService,
      { append: jest.fn() } as unknown as ForensicTrailService,
      companyRepository,
      userRepository,
      {
        find: jest.fn().mockResolvedValue([]),
      } as unknown as Repository<ForensicTrailEvent>,
    );

    const preview = await service.getPreview('company-1');

    expect(preview.recipients).toEqual({
      notificationUsers: 2,
      emailRecipients: ['sst@example.com', 'compliance@example.com'],
    });
    expect(preview.alerts.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        'dds_public_suspicious_spike',
        'dds_public_blocked_spike',
        'dds_governance_backlog',
        'dds_approval_backlog',
      ]),
    );
    expect(preview.investigationQueue).toEqual([
      expect.objectContaining({ documentRef: 'DDS-2026-ABCD1234' }),
    ]);
  });

  it('dispara notificações e e-mail quando existem alertas não deduplicados', async () => {
    const observabilityService = {
      getOverview: jest.fn().mockResolvedValue({
        tenantScope: 'tenant',
        publicValidation: {
          suspiciousLast7d: 6,
          blockedLast7d: 0,
          topDocuments: [],
        },
        portfolio: { pendingGovernance: 0 },
        approvals: { pending: 0 },
      }),
    } as unknown as DdsObservabilityService;

    const notificationsService = {
      createDeduped: jest.fn().mockResolvedValue({}),
    };
    const mailService = {
      sendMailSimple: jest.fn().mockResolvedValue({}),
    };
    const forensicTrail = {
      append: jest.fn().mockResolvedValue({}),
    };

    const service = new DdsObservabilityAlertsService(
      observabilityService,
      notificationsService as unknown as NotificationsService,
      mailService as unknown as MailService,
      {
        tryAcquire: jest.fn(),
        release: jest.fn(),
      } as unknown as DistributedLockService,
      forensicTrail as unknown as ForensicTrailService,
      {
        findOne: jest.fn().mockResolvedValue({
          id: 'company-1',
          email_contato: 'compliance@example.com',
          alert_settings: { recipients: [] },
        }),
      } as unknown as Repository<Company>,
      {
        createQueryBuilder: jest.fn().mockReturnValue({
          leftJoin: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue([{ id: 'user-1' }]),
        }),
      } as unknown as Repository<User>,
      {
        find: jest.fn().mockResolvedValue([]),
      } as unknown as Repository<ForensicTrailEvent>,
    );

    await expect(service.dispatch('company-1')).resolves.toMatchObject({
      dispatched: true,
      notificationsCreated: 1,
      emailSent: true,
      alerts: [
        expect.objectContaining({ code: 'dds_public_suspicious_spike' }),
      ],
    });

    expect(notificationsService.createDeduped).toHaveBeenCalledTimes(1);
    expect(mailService.sendMailSimple).toHaveBeenCalledTimes(1);
    expect(forensicTrail.append).toHaveBeenCalledTimes(1);
  });
});
