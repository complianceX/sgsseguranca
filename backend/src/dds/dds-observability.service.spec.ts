import type { DataSource } from 'typeorm';
import type { TenantService } from '../common/tenant/tenant.service';
import { DdsObservabilityService } from './dds-observability.service';

describe('DdsObservabilityService', () => {
  it('agrega portfolio, aprovações e validação pública por tenant', async () => {
    const queryMock = jest
      .fn()
      .mockResolvedValueOnce([
        {
          total: '15',
          drafts: '2',
          published: '5',
          audited: '6',
          archived: '2',
          templates: '3',
          governed_pdfs: '7',
          pending_governance: '4',
        },
      ])
      .mockResolvedValueOnce([
        {
          not_started: '2',
          pending: '3',
          approved: '6',
        },
      ])
      .mockResolvedValueOnce([
        { action: 'approved', total: '4' },
        { action: 'rejected', total: '1' },
      ])
      .mockResolvedValueOnce([
        {
          total: '9',
          success: '6',
          suspicious: '3',
          blocked: '1',
          unique_ips: '4',
        },
      ])
      .mockResolvedValueOnce([
        { reason: 'invalid_token', total: '2' },
        { reason: 'bot_user_agent', total: '1' },
      ])
      .mockResolvedValueOnce([
        {
          document_ref: 'DDS-2026-ABCD1234',
          total: '5',
          suspicious: '2',
          blocked: '1',
          last_seen_at: '2026-04-18T10:00:00.000Z',
        },
      ])
      .mockResolvedValueOnce([
        {
          occurred_at: '2026-04-18T10:00:00.000Z',
          outcome: 'success',
          document_ref: 'DDS-2026-ABCD1234',
          suspicious: 'false',
          blocked: 'false',
          ip: '127.0.0.1',
          reasons: '[]',
        },
      ]);

    const dataSource = {
      query: queryMock,
    } as unknown as DataSource;

    const tenantService = {
      getTenantId: jest.fn(() => 'company-1'),
    } as unknown as TenantService;

    const service = new DdsObservabilityService(dataSource, tenantService);

    await expect(service.getOverview()).resolves.toMatchObject({
      tenantScope: 'tenant',
      portfolio: {
        total: 15,
        templates: 3,
        governedPdfs: 7,
      },
      approvals: {
        notStarted: 2,
        pending: 3,
        approved: 6,
        approvedLast7d: 4,
        rejectedLast7d: 1,
        reopenedLast7d: 0,
      },
      publicValidation: {
        totalLast7d: 9,
        successLast7d: 6,
        suspiciousLast7d: 3,
        blockedLast7d: 1,
        uniqueIpsLast7d: 4,
        topReasons: [
          { reason: 'invalid_token', total: 2 },
          { reason: 'bot_user_agent', total: 1 },
        ],
        topDocuments: [
          {
            documentRef: 'DDS-2026-ABCD1234',
            total: 5,
            suspicious: 2,
            blocked: 1,
          },
        ],
      },
    });

    expect(queryMock).toHaveBeenCalledTimes(7);
    expect(queryMock.mock.calls[3]?.[0]).toContain(
      "COUNT(DISTINCT COALESCE(ip::text, 'unknown')) AS unique_ips",
    );
  });
});
