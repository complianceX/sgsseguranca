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
};

export type SophieWizardDraft = {
  step: number;
  values: Record<string, unknown>;
  signatures?: WizardSignatureMap;
  metadata?: SophieWizardDraftMetadata;
};

function resolveCompanyStorageKey(companyId?: string | null) {
  return companyId || 'default';
}

function persistDraft(key: string, draft: SophieWizardDraft) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    key,
    JSON.stringify({
      step: draft.step,
      values: draft.values,
      signatures: draft.signatures || {},
      metadata: draft.metadata || {},
    }),
  );
}

export function storeSophieAprDraft(
  companyId: string | null | undefined,
  draft: SophieWizardDraft,
  metadata?: SophieWizardDraftMetadata,
) {
  persistDraft(`gst.apr.wizard.draft.${resolveCompanyStorageKey(companyId)}`, {
    ...draft,
    metadata: metadata || draft.metadata,
  });
}

export function storeSophiePtDraft(
  companyId: string | null | undefined,
  draft: SophieWizardDraft,
  metadata?: SophieWizardDraftMetadata,
) {
  persistDraft(`gst.pt.wizard.draft.${resolveCompanyStorageKey(companyId)}`, {
    ...draft,
    metadata: metadata || draft.metadata,
  });
}
