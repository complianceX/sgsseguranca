import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantService } from '../common/tenant/tenant.service';

type CountRow = {
  total?: string | number | null;
  drafts?: string | number | null;
  published?: string | number | null;
  audited?: string | number | null;
  archived?: string | number | null;
  templates?: string | number | null;
  governed_pdfs?: string | number | null;
  pending_governance?: string | number | null;
  not_started?: string | number | null;
  pending?: string | number | null;
  approved?: string | number | null;
  success?: string | number | null;
  suspicious?: string | number | null;
  blocked?: string | number | null;
  unique_ips?: string | number | null;
};

type ApprovalActionRow = {
  action: string | null;
  total: string | number | null;
};

type ValidationReasonRow = {
  reason: string | null;
  total: string | number | null;
};

type ValidationDocumentRow = {
  document_ref: string | null;
  total: string | number | null;
  suspicious: string | number | null;
  blocked: string | number | null;
  last_seen_at: string | null;
};

type ValidationEventRow = {
  occurred_at: string | Date | null;
  outcome: string | null;
  document_ref: string | null;
  suspicious: boolean | string | null;
  blocked: boolean | string | null;
  ip: string | null;
  reasons: unknown;
};

export type DdsObservabilityOverview = {
  generatedAt: string;
  tenantScope: 'tenant' | 'global';
  portfolio: {
    total: number;
    drafts: number;
    published: number;
    audited: number;
    archived: number;
    templates: number;
    governedPdfs: number;
    pendingGovernance: number;
  };
  approvals: {
    notStarted: number;
    pending: number;
    approved: number;
    approvedLast7d: number;
    rejectedLast7d: number;
    reopenedLast7d: number;
  };
  publicValidation: {
    totalLast7d: number;
    successLast7d: number;
    suspiciousLast7d: number;
    blockedLast7d: number;
    uniqueIpsLast7d: number;
    topReasons: Array<{ reason: string; total: number }>;
    topDocuments: Array<{
      documentRef: string;
      total: number;
      suspicious: number;
      blocked: number;
      lastSeenAt: string | null;
    }>;
    recentEvents: Array<{
      occurredAt: string | null;
      outcome: string;
      documentRef: string;
      suspicious: boolean;
      blocked: boolean;
      ip: string | null;
      reasons: string[];
    }>;
  };
};

@Injectable()
export class DdsObservabilityService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly tenantService: TenantService,
  ) {}

  async getOverview(): Promise<DdsObservabilityOverview> {
    const tenantId = this.tenantService.getTenantId() ?? null;
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [
      portfolioRow,
      approvalRow,
      approvalActions,
      validationRow,
      validationReasons,
      validationDocuments,
      validationEvents,
    ] = await Promise.all([
      this.loadPortfolio(tenantId),
      this.loadApprovalStatus(tenantId),
      this.loadApprovalActions(tenantId, cutoff),
      this.loadValidationAggregate(tenantId, cutoff),
      this.loadValidationReasons(tenantId, cutoff),
      this.loadValidationDocuments(tenantId, cutoff),
      this.loadRecentValidationEvents(tenantId, cutoff),
    ]);

    const approvalActionsMap = new Map(
      approvalActions.map((row) => [
        row.action || 'unknown',
        this.toCount(row.total),
      ]),
    );

    return {
      generatedAt: new Date().toISOString(),
      tenantScope: tenantId ? 'tenant' : 'global',
      portfolio: {
        total: this.toCount(portfolioRow.total),
        drafts: this.toCount(portfolioRow.drafts),
        published: this.toCount(portfolioRow.published),
        audited: this.toCount(portfolioRow.audited),
        archived: this.toCount(portfolioRow.archived),
        templates: this.toCount(portfolioRow.templates),
        governedPdfs: this.toCount(portfolioRow.governed_pdfs),
        pendingGovernance: this.toCount(portfolioRow.pending_governance),
      },
      approvals: {
        notStarted: this.toCount(approvalRow.not_started),
        pending: this.toCount(approvalRow.pending),
        approved: this.toCount(approvalRow.approved),
        approvedLast7d: approvalActionsMap.get('approved') || 0,
        rejectedLast7d: approvalActionsMap.get('rejected') || 0,
        reopenedLast7d: approvalActionsMap.get('reopened') || 0,
      },
      publicValidation: {
        totalLast7d: this.toCount(validationRow.total),
        successLast7d: this.toCount(validationRow.success),
        suspiciousLast7d: this.toCount(validationRow.suspicious),
        blockedLast7d: this.toCount(validationRow.blocked),
        uniqueIpsLast7d: this.toCount(validationRow.unique_ips),
        topReasons: validationReasons.map((row) => ({
          reason: row.reason || 'unknown',
          total: this.toCount(row.total),
        })),
        topDocuments: validationDocuments.map((row) => ({
          documentRef: row.document_ref || 'unknown',
          total: this.toCount(row.total),
          suspicious: this.toCount(row.suspicious),
          blocked: this.toCount(row.blocked),
          lastSeenAt: row.last_seen_at || null,
        })),
        recentEvents: validationEvents.map((row) => ({
          occurredAt: this.toIsoString(row.occurred_at),
          outcome: row.outcome || 'unknown',
          documentRef: row.document_ref || 'unknown',
          suspicious: this.toBoolean(row.suspicious),
          blocked: this.toBoolean(row.blocked),
          ip: row.ip || null,
          reasons: this.parseReasons(row.reasons),
        })),
      },
    };
  }

  private async loadPortfolio(tenantId: string | null): Promise<CountRow> {
    const params = tenantId ? [tenantId] : [];
    const tenantFilter = tenantId ? 'AND d.company_id = $1' : '';
    const rows: CountRow[] = await this.dataSource.query(
      `
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE d.status = 'rascunho') AS drafts,
          COUNT(*) FILTER (WHERE d.status = 'publicado') AS published,
          COUNT(*) FILTER (WHERE d.status = 'auditado') AS audited,
          COUNT(*) FILTER (WHERE d.status = 'arquivado') AS archived,
          COUNT(*) FILTER (WHERE d.is_modelo = true) AS templates,
          COUNT(*) FILTER (WHERE d.pdf_file_key IS NOT NULL) AS governed_pdfs,
          COUNT(*) FILTER (
            WHERE d.status IN ('rascunho', 'publicado')
              AND d.pdf_file_key IS NULL
          ) AS pending_governance
        FROM dds d
        WHERE d.deleted_at IS NULL
          ${tenantFilter}
      `,
      params,
    );
    const [row] = rows;
    return row || {};
  }

  private async loadApprovalStatus(tenantId: string | null): Promise<CountRow> {
    const params = tenantId ? [tenantId] : [];
    const tenantFilter = tenantId ? 'AND d.company_id = $1' : '';
    const rows: CountRow[] = await this.dataSource.query(
      `
        WITH scoped_dds AS (
          SELECT d.id, d.company_id, d.status
          FROM dds d
          WHERE d.deleted_at IS NULL
            ${tenantFilter}
        ),
        approval_presence AS (
          SELECT
            d.id,
            d.status,
            EXISTS (
              SELECT 1
              FROM dds_approval_records ar
              WHERE ar.dds_id = d.id
                AND ar.company_id = d.company_id
            ) AS has_flow
          FROM scoped_dds d
        )
        SELECT
          COUNT(*) FILTER (WHERE status = 'publicado' AND has_flow = false) AS not_started,
          COUNT(*) FILTER (WHERE status = 'publicado' AND has_flow = true) AS pending,
          COUNT(*) FILTER (WHERE status = 'auditado') AS approved
        FROM approval_presence
      `,
      params,
    );
    const [row] = rows;
    return row || {};
  }

  private async loadApprovalActions(
    tenantId: string | null,
    cutoffIso: string,
  ): Promise<ApprovalActionRow[]> {
    const params = tenantId ? [cutoffIso, tenantId] : [cutoffIso];
    const tenantFilter = tenantId ? 'AND company_id = $2' : '';
    const rows: ApprovalActionRow[] = await this.dataSource.query(
      `
        SELECT
          action,
          COUNT(DISTINCT CONCAT(dds_id::text, ':', cycle::text)) AS total
        FROM dds_approval_records
        WHERE event_at >= $1
          AND action IN ('approved', 'rejected', 'reopened')
          ${tenantFilter}
        GROUP BY action
      `,
      params,
    );
    return rows;
  }

  private async loadValidationAggregate(
    tenantId: string | null,
    cutoffIso: string,
  ): Promise<CountRow> {
    const params = tenantId ? [cutoffIso, tenantId] : [cutoffIso];
    const tenantFilter = tenantId ? 'AND company_id = $2' : '';
    const rows: CountRow[] = await this.dataSource.query(
      `
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE metadata->>'outcome' = 'success') AS success,
          COUNT(*) FILTER (WHERE COALESCE(metadata->>'suspicious', 'false') = 'true') AS suspicious,
          COUNT(*) FILTER (WHERE COALESCE(metadata->>'blocked', 'false') = 'true') AS blocked,
          COUNT(DISTINCT COALESCE(ip::text, 'unknown')) AS unique_ips
        FROM forensic_trail_events
        WHERE module = 'dds_public_validation'
          AND occurred_at >= $1
          ${tenantFilter}
      `,
      params,
    );
    const [row] = rows;
    return row || {};
  }

  private async loadValidationReasons(
    tenantId: string | null,
    cutoffIso: string,
  ): Promise<ValidationReasonRow[]> {
    const params = tenantId ? [cutoffIso, tenantId] : [cutoffIso];
    const tenantFilter = tenantId ? 'AND event.company_id = $2' : '';
    const rows: ValidationReasonRow[] = await this.dataSource.query(
      `
        SELECT
          reason.value AS reason,
          COUNT(*) AS total
        FROM forensic_trail_events event
        CROSS JOIN LATERAL jsonb_array_elements_text(
          COALESCE(event.metadata->'reasons', '[]'::jsonb)
        ) AS reason(value)
        WHERE event.module = 'dds_public_validation'
          AND event.occurred_at >= $1
          ${tenantFilter}
        GROUP BY reason.value
        ORDER BY total DESC, reason.value ASC
        LIMIT 5
      `,
      params,
    );
    return rows;
  }

  private async loadValidationDocuments(
    tenantId: string | null,
    cutoffIso: string,
  ): Promise<ValidationDocumentRow[]> {
    const params = tenantId ? [cutoffIso, tenantId] : [cutoffIso];
    const tenantFilter = tenantId ? 'AND company_id = $2' : '';
    const rows: ValidationDocumentRow[] = await this.dataSource.query(
      `
        SELECT
          COALESCE(metadata->>'document_ref', entity_id) AS document_ref,
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE COALESCE(metadata->>'suspicious', 'false') = 'true') AS suspicious,
          COUNT(*) FILTER (WHERE COALESCE(metadata->>'blocked', 'false') = 'true') AS blocked,
          MAX(occurred_at) AS last_seen_at
        FROM forensic_trail_events
        WHERE module = 'dds_public_validation'
          AND occurred_at >= $1
          ${tenantFilter}
        GROUP BY COALESCE(metadata->>'document_ref', entity_id)
        ORDER BY total DESC, last_seen_at DESC
        LIMIT 5
      `,
      params,
    );
    return rows;
  }

  private async loadRecentValidationEvents(
    tenantId: string | null,
    cutoffIso: string,
  ): Promise<ValidationEventRow[]> {
    const params = tenantId ? [cutoffIso, tenantId] : [cutoffIso];
    const tenantFilter = tenantId ? 'AND company_id = $2' : '';
    const rows: ValidationEventRow[] = await this.dataSource.query(
      `
        SELECT
          occurred_at,
          COALESCE(metadata->>'outcome', 'unknown') AS outcome,
          COALESCE(metadata->>'document_ref', entity_id) AS document_ref,
          COALESCE(metadata->>'suspicious', 'false') AS suspicious,
          COALESCE(metadata->>'blocked', 'false') AS blocked,
          ip,
          COALESCE(metadata->'reasons', '[]'::jsonb) AS reasons
        FROM forensic_trail_events
        WHERE module = 'dds_public_validation'
          AND occurred_at >= $1
          ${tenantFilter}
        ORDER BY occurred_at DESC
        LIMIT 12
      `,
      params,
    );
    return rows;
  }

  private toCount(value: string | number | null | undefined): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private toBoolean(value: boolean | string | null | undefined): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    return (
      String(value || '')
        .trim()
        .toLowerCase() === 'true'
    );
  }

  private toIsoString(value: string | Date | null | undefined): string | null {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? String(value)
      : parsed.toISOString();
  }

  private parseReasons(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === 'string');
    }

    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value) as unknown;
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (item): item is string => typeof item === 'string',
          );
        }
      } catch {
        return [];
      }
    }

    return [];
  }
}
