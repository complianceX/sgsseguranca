import api from "@/lib/api";
import { AxiosError } from "axios";

export interface DashboardSummaryResponse {
  counts: {
    users: number;
    companies: number;
    sites: number;
    checklists: number;
    aprs: number;
    pts: number;
  };
  expiringEpis: Array<{
    id: string;
    nome: string;
    ca: string | null;
    validade_ca: string | null;
  }>;
  expiringTrainings: Array<{
    id: string;
    nome: string;
    data_vencimento: string;
    user: { nome: string } | null;
  }>;
  pendingApprovals: {
    aprs: number;
    pts: number;
    checklists: number;
    nonconformities: number;
  };
  actionPlanItems: Array<{
    id: string;
    source: string;
    title: string;
    action: string;
    responsavel: string | null;
    prazo: string | null;
    status: string | null;
    href: string;
  }>;
  riskSummary: {
    alto: number;
    medio: number;
    baixo: number;
  };
  evidenceSummary: {
    total: number;
    inspections: number;
    nonconformities: number;
    audits: number;
  };
  modelCounts: {
    aprs: number;
    dds: number;
    checklists: number;
  };
  recentActivities: Array<{
    id: string;
    title: string;
    description: string;
    date: string;
    href: string;
    color: string;
  }>;
  siteCompliance: Array<{
    id: string;
    nome: string;
    total: number;
    conformes: number;
    taxa: number;
  }>;
  recentReports: Array<{
    id: string;
    titulo: string;
    mes: number;
    ano: number;
    created_at: string;
  }>;
}

export interface DashboardKpisResponse {
  leading: {
    apr_before_task: { total: number; compliant: number; percentage: number };
    completed_inspections: {
      total: number;
      completed: number;
      percentage: number;
    };
    training_compliance: {
      total: number;
      compliant: number;
      percentage: number;
    };
  };
  lagging: {
    recurring_nc: number;
    incidents: number;
    blocked_pt: number;
  };
  trends: {
    risk: Array<{ month: string; risk_score: number }>;
    nc: Array<{ month: string; count: number }>;
  };
  alerts: Array<{
    id: string;
    type: string;
    message: string;
    created_at: string;
    read: boolean;
  }>;
}

export type DashboardHeatmapResponse = Array<{
  site_id: string;
  site_name: string;
  risk_score: number;
  nc_count?: number;
  apr_count?: number;
  training_compliance?: number;
}>;

export interface TstDayDashboard {
  summary: {
    pendingPtApprovals: number;
    criticalNonConformities: number;
    overdueInspections: number;
    expiringDocuments: number;
  };
  pendingPtApprovals: Array<{
    id: string;
    numero: string;
    titulo: string;
    status: string;
    site: string | null;
    responsavel: string | null;
    residual_risk: string | null;
  }>;
  criticalNonConformities: Array<{
    id: string;
    codigo_nc: string;
    status: string;
    risco_nivel: string;
    local_setor_area: string;
    site: string | null;
  }>;
  overdueInspections: Array<{
    id: string;
    setor_area: string;
    data_inspecao: string;
    responsavel: string | null;
    site: string | null;
  }>;
  expiringDocuments: {
    medicalExams: Array<{
      id: string;
      workerName: string | null;
      tipo_exame: string;
      data_vencimento: string | null;
      resultado: string;
    }>;
    trainings: Array<{
      id: string;
      workerName: string | null;
      nome: string;
      data_vencimento: string;
      bloqueia_operacao_quando_vencido: boolean;
    }>;
  };
}

export interface DashboardPendingQueueResponse {
  degraded?: boolean;
  failedSources?: string[];
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    documents: number;
    health: number;
    actions: number;
    slaBreached: number;
    slaDueToday: number;
    slaDueSoon: number;
  };
  items: Array<{
    id: string;
    sourceId: string;
    module: string;
    category: "documents" | "health" | "actions";
    title: string;
    description: string;
    priority: "critical" | "high" | "medium";
    status: string;
    responsible: string | null;
    siteId: string | null;
    site: string | null;
    dueDate: string | null;
    slaStatus:
      | "breached"
      | "due_today"
      | "due_soon"
      | "on_track"
      | "unscheduled";
    daysToDue: number | null;
    overdueByDays: number | null;
    breached: boolean;
    href: string;
  }>;
}

const EMPTY_PENDING_QUEUE_SUMMARY: DashboardPendingQueueResponse["summary"] = {
  total: 0,
  critical: 0,
  high: 0,
  medium: 0,
  documents: 0,
  health: 0,
  actions: 0,
  slaBreached: 0,
  slaDueToday: 0,
  slaDueSoon: 0,
};

const EMPTY_PENDING_QUEUE_RESPONSE: DashboardPendingQueueResponse = {
  degraded: false,
  failedSources: [],
  summary: EMPTY_PENDING_QUEUE_SUMMARY,
  items: [],
};

const PENDING_QUEUE_PRIORITIES = new Set(["critical", "high", "medium"]);
const PENDING_QUEUE_CATEGORIES = new Set(["documents", "health", "actions"]);
const PENDING_QUEUE_SLA_STATUSES = new Set([
  "breached",
  "due_today",
  "due_soon",
  "on_track",
  "unscheduled",
]);

function asNonNegativeNumber(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

function asNullableString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePendingQueueResponse(
  payload: unknown,
): DashboardPendingQueueResponse {
  if (!payload || typeof payload !== "object") {
    return { ...EMPTY_PENDING_QUEUE_RESPONSE };
  }

  const raw = payload as Partial<DashboardPendingQueueResponse>;
  const summary = raw.summary || {};
  const failedSources = Array.isArray(raw.failedSources)
    ? raw.failedSources.filter(
        (source): source is string =>
          typeof source === "string" && source.trim().length > 0,
      )
    : [];

  const items = Array.isArray(raw.items)
    ? raw.items
        .filter(
          (item): item is Record<string, unknown> =>
            !!item && typeof item === "object",
        )
        .map((item, index) => {
          const fallbackId = `pending-item-${index + 1}`;
          const id = asNullableString(item.id) ?? fallbackId;
          const sourceId = asNullableString(item.sourceId) ?? id;
          const moduleName = asNullableString(item.module) ?? "Operacional";
          const categoryRaw = asNullableString(item.category);
          const category = PENDING_QUEUE_CATEGORIES.has(categoryRaw || "")
            ? (categoryRaw as "documents" | "health" | "actions")
            : "actions";
          const priorityRaw = asNullableString(item.priority);
          const priority = PENDING_QUEUE_PRIORITIES.has(priorityRaw || "")
            ? (priorityRaw as "critical" | "high" | "medium")
            : "medium";
          const slaRaw = asNullableString(item.slaStatus);
          const slaStatus = PENDING_QUEUE_SLA_STATUSES.has(slaRaw || "")
            ? (slaRaw as
                | "breached"
                | "due_today"
                | "due_soon"
                | "on_track"
                | "unscheduled")
            : "unscheduled";
          const href = asNullableString(item.href) ?? "/dashboard";

          return {
            id,
            sourceId,
            module: moduleName,
            category,
            title: asNullableString(item.title) ?? "Item pendente",
            description:
              asNullableString(item.description) ??
              "Requer validação operacional.",
            priority,
            status: asNullableString(item.status) ?? "Pendente",
            responsible: asNullableString(item.responsible),
            siteId: asNullableString(item.siteId),
            site: asNullableString(item.site),
            dueDate: asNullableString(item.dueDate),
            slaStatus,
            daysToDue: asNullableNumber(item.daysToDue),
            overdueByDays: asNullableNumber(item.overdueByDays),
            breached: Boolean(item.breached),
            href,
          };
        })
    : [];

  return {
    degraded: Boolean(raw.degraded) || failedSources.length > 0,
    failedSources,
    summary: {
      total: asNonNegativeNumber(summary.total),
      critical: asNonNegativeNumber(summary.critical),
      high: asNonNegativeNumber(summary.high),
      medium: asNonNegativeNumber(summary.medium),
      documents: asNonNegativeNumber(summary.documents),
      health: asNonNegativeNumber(summary.health),
      actions: asNonNegativeNumber(summary.actions),
      slaBreached: asNonNegativeNumber(summary.slaBreached),
      slaDueToday: asNonNegativeNumber(summary.slaDueToday),
      slaDueSoon: asNonNegativeNumber(summary.slaDueSoon),
    },
    items,
  };
}

export type DocumentPendencyCriticality =
  | "critical"
  | "high"
  | "medium"
  | "low";

export type DocumentPendencyType =
  | "missing_final_pdf"
  | "missing_required_signature"
  | "degraded_document_availability"
  | "failed_import"
  | "unavailable_governed_video"
  | "unavailable_governed_attachment";

export type DocumentPendencyActionKey =
  | "open_document"
  | "open_final_pdf"
  | "open_public_validation"
  | "retry_import"
  | "open_replacement_document"
  | "open_governed_video"
  | "open_governed_attachment";

export interface DashboardDocumentPendencyAllowedAction {
  key: DocumentPendencyActionKey;
  label: string;
  kind: "route" | "resolve" | "mutation";
  enabled: boolean;
  href?: string | null;
  reason?: string | null;
}

export interface DashboardDocumentPendencyItem {
  id: string;
  type: DocumentPendencyType;
  typeLabel: string;
  module: string;
  moduleLabel: string;
  companyId: string;
  companyName: string | null;
  siteId: string | null;
  siteName: string | null;
  documentId: string | null;
  documentCode: string | null;
  title: string | null;
  status: string | null;
  documentStatus: string | null;
  signatureStatus: string | null;
  availabilityStatus: string | null;
  criticality: DocumentPendencyCriticality;
  priority: DocumentPendencyCriticality;
  relevantDate: string | null;
  message: string;
  action: {
    label: string;
    href: string;
  } | null;
  allowedActions: DashboardDocumentPendencyAllowedAction[];
  suggestedRoute: string | null;
  suggestedRouteParams: Record<string, string | number | boolean | null> | null;
  publicValidationUrl: string | null;
  retryAllowed: boolean;
  replacementDocumentId: string | null;
  replacementRoute: string | null;
  metadata: Record<string, string | number | boolean | null>;
}

export interface DashboardDocumentPendencyResolvedActionResponse {
  actionKey: DocumentPendencyActionKey;
  url: string | null;
  availability: string | null;
  message: string | null;
  fileName: string | null;
  fileType: string | null;
}

export interface DashboardDocumentPendenciesResponse {
  degraded: boolean;
  failedSources: string[];
  summary: {
    total: number;
    byCriticality: Record<DocumentPendencyCriticality, number>;
    byType: Array<{
      type: DocumentPendencyType;
      label: string;
      total: number;
    }>;
    byModule: Array<{
      module: string;
      label: string;
      total: number;
    }>;
  };
  filtersApplied: {
    companyId?: string;
    siteId?: string;
    module?: string;
    criticality?: DocumentPendencyCriticality;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    lastPage: number;
  };
  items: DashboardDocumentPendencyItem[];
}

export const dashboardService = {
  getSummary: async () => {
    const response =
      await api.get<DashboardSummaryResponse>("/dashboard/summary");
    return response.data;
  },

  getKpis: async () => {
    const response = await api.get<DashboardKpisResponse>("/dashboard/kpis");
    return response.data;
  },

  getHeatmap: async () => {
    const response =
      await api.get<DashboardHeatmapResponse>("/dashboard/heatmap");
    return response.data;
  },

  getTstDay: async () => {
    const response = await api.get<TstDayDashboard>("/dashboard/tst-day");
    return response.data;
  },

  getPendingQueue: async () => {
    try {
      const response = await api.get<DashboardPendingQueueResponse>(
        "/dashboard/pending-queue",
      );
      return normalizePendingQueueResponse(response.data);
    } catch (error) {
      const status = (error as AxiosError).response?.status;
      if (status && [429, 500, 502, 503, 504].includes(status)) {
        return normalizePendingQueueResponse({
          degraded: true,
          failedSources: ["pending-queue"],
          summary: EMPTY_PENDING_QUEUE_SUMMARY,
          items: [],
        } satisfies DashboardPendingQueueResponse);
      }
      throw error;
    }
  },

  getDocumentPendencies: async (filters?: {
    companyId?: string;
    siteId?: string;
    module?: string;
    priority?: DocumentPendencyCriticality;
    criticality?: DocumentPendencyCriticality;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) => {
    const response = await api.get<DashboardDocumentPendenciesResponse>(
      "/dashboard/document-pendencies",
      {
        params: {
          ...(filters?.companyId ? { companyId: filters.companyId } : {}),
          ...(filters?.siteId ? { siteId: filters.siteId } : {}),
          ...(filters?.module ? { module: filters.module } : {}),
          ...(filters?.priority ? { priority: filters.priority } : {}),
          ...(filters?.criticality ? { criticality: filters.criticality } : {}),
          ...(filters?.status ? { status: filters.status } : {}),
          ...(filters?.dateFrom ? { dateFrom: filters.dateFrom } : {}),
          ...(filters?.dateTo ? { dateTo: filters.dateTo } : {}),
          ...(filters?.page ? { page: filters.page } : {}),
          ...(filters?.limit ? { limit: filters.limit } : {}),
        },
      },
    );
    return response.data;
  },

  resolveDocumentPendencyAction: async (payload: {
    actionKey: "open_final_pdf" | "open_governed_video" | "open_governed_attachment";
    module: string;
    documentId: string;
    attachmentId?: string;
    attachmentIndex?: number;
  }) => {
    const response = await api.post<DashboardDocumentPendencyResolvedActionResponse>(
      "/dashboard/document-pendencies/actions/resolve",
      payload,
    );
    return response.data;
  },

  retryDocumentPendencyImport: async (documentId: string) => {
    const response = await api.post(`/dashboard/document-pendencies/imports/${documentId}/retry`);
    return response.data;
  },
};
