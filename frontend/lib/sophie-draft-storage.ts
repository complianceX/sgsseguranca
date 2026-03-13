type WizardSignatureMap = Record<string, { data: string; type: string }>;

export type SophieWizardDraft = {
  step: number;
  values: Record<string, unknown>;
  signatures?: WizardSignatureMap;
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
    }),
  );
}

export function storeSophieAprDraft(
  companyId: string | null | undefined,
  draft: SophieWizardDraft,
) {
  persistDraft(`gst.apr.wizard.draft.${resolveCompanyStorageKey(companyId)}`, draft);
}

export function storeSophiePtDraft(
  companyId: string | null | undefined,
  draft: SophieWizardDraft,
) {
  persistDraft(`gst.pt.wizard.draft.${resolveCompanyStorageKey(companyId)}`, draft);
}
