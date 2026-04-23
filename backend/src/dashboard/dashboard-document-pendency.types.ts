import {
  DocumentPendencyCriticality,
  DocumentPendencyType,
} from './dashboard-document-pendencies.classifier';

export type DashboardDocumentPendenciesFilters = {
  siteId?: string;
  module?: string;
  priority?: string;
  criticality?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
};

export type NormalizedDashboardDocumentPendenciesFilters = {
  companyId?: string;
  siteId?: string;
  module?: string;
  criticality?: DocumentPendencyCriticality;
  status?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page: number;
  limit: number;
};

export type DocumentPendencyActionKey =
  | 'open_document'
  | 'open_final_pdf'
  | 'open_public_validation'
  | 'retry_import'
  | 'open_replacement_document'
  | 'open_governed_video'
  | 'open_governed_attachment';

export type DocumentPendencyActionKind = 'route' | 'resolve' | 'mutation';

export type DashboardDocumentPendencyAllowedAction = {
  key: DocumentPendencyActionKey;
  label: string;
  kind: DocumentPendencyActionKind;
  enabled: boolean;
  href?: string | null;
  reason?: string | null;
};

export type DocumentPendencyAction = {
  label: string;
  href: string;
};

export type DashboardDocumentPendencyItem = {
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
  action: DocumentPendencyAction | null;
  allowedActions: DashboardDocumentPendencyAllowedAction[];
  suggestedRoute: string | null;
  suggestedRouteParams: Record<string, string | number | boolean | null> | null;
  publicValidationUrl: string | null;
  retryAllowed: boolean;
  replacementDocumentId: string | null;
  replacementRoute: string | null;
  metadata: Record<string, string | number | boolean | null>;
};

export type DashboardDocumentPendenciesResponse = {
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
};

export const DOCUMENT_PENDENCY_MODULE_VIEW_PERMISSIONS: Record<string, string> =
  {
    apr: 'can_view_apr',
    pt: 'can_view_pt',
    dds: 'can_view_dds',
    checklist: 'can_view_checklists',
    inspection: 'can_view_inspections',
    rdo: 'can_view_rdos',
    cat: 'can_view_cats',
    audit: 'can_view_audits',
    nonconformity: 'can_manage_nc',
    'document-import': 'can_import_documents',
  };
