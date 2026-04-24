type WizardSignatureMap = Record<string, { data: string; type: string }>;

export type SophieDraftRiskSuggestion = {
  id?: string;
  label: string;
  category?: string;
};

export type SophieDraftChecklistSuggestion = {
  id: string;
  label: string;
  reason: string;
  source: 'template' | 'pt-group';
};

export type SophieWizardDraftMetadata = {
  suggestedRisks?: SophieDraftRiskSuggestion[];
  mandatoryChecklists?: SophieDraftChecklistSuggestion[];
  riskLevel?: string;
};

export type SophieWizardDraft = {
  step: number;
  values: Record<string, unknown>;
  signatures?: WizardSignatureMap;
  metadata?: SophieWizardDraftMetadata;
};

export type SophieNcPreview = {
  id: string;
  riskLevel?: string;
  sourceType?: 'manual' | 'image' | 'checklist' | 'inspection';
  actionPlan?: Array<{
    title: string;
    owner: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    timeline: string;
    type: 'immediate' | 'corrective' | 'preventive';
  }>;
  evidenceAttachments?: Array<{
    url: string;
    label: string;
  }>;
  notes?: string[];
};

const SENSITIVE_DRAFT_KEY_RE =
  /(cpf|documento|assinatura|signature|evidence|evidencia|photo|foto|image|imagem|attachment|anexo|arquivo|file|base64|dataurl|data_url|saude|medical|exame)/i;

function resolveCompanyStorageKey(companyId?: string | null) {
  return companyId || 'default';
}

function sanitizeDraftValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDraftValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>(
      (acc, [key, item]) => {
        if (SENSITIVE_DRAFT_KEY_RE.test(key)) {
          return acc;
        }
        acc[key] = sanitizeDraftValue(item);
        return acc;
      },
      {},
    );
  }

  if (typeof value === 'string' && value.startsWith('data:')) {
    return '';
  }

  return value;
}

function persistDraft(
  key: string,
  draft: SophieWizardDraft,
  options?: { includeSignatures?: boolean },
) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    key,
    JSON.stringify({
      step: draft.step,
      values: sanitizeDraftValue(draft.values),
      signatures: options?.includeSignatures === false ? {} : draft.signatures || {},
      metadata: draft.metadata || {},
    }),
  );
}

export function storeSophieAprDraft(
  companyId: string | null | undefined,
  draft: SophieWizardDraft,
  metadata?: SophieWizardDraftMetadata,
) {
  persistDraft(
    `gst.apr.wizard.draft.${resolveCompanyStorageKey(companyId)}`,
    {
      ...draft,
      metadata: metadata || draft.metadata,
    },
    { includeSignatures: false },
  );
}

export function storeSophiePtDraft(
  companyId: string | null | undefined,
  draft: SophieWizardDraft,
  metadata?: SophieWizardDraftMetadata,
) {
  persistDraft(
    `gst.pt.wizard.draft.${resolveCompanyStorageKey(companyId)}`,
    {
      ...draft,
      metadata: metadata || draft.metadata,
    },
    { includeSignatures: false },
  );
}

export function storeSophieNcPreview(preview: SophieNcPreview) {
  if (typeof window === 'undefined' || !preview.id) {
    return;
  }

  window.localStorage.setItem(
    `gst.nc.sophie.preview.${preview.id}`,
      JSON.stringify({
        ...preview,
        evidenceAttachments: [],
      }),
  );
}

export function readSophieNcPreview(id: string): SophieNcPreview | null {
  if (typeof window === 'undefined' || !id) {
    return null;
  }

  const raw = window.localStorage.getItem(`gst.nc.sophie.preview.${id}`);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as SophieNcPreview;
  } catch {
    return null;
  }
}
