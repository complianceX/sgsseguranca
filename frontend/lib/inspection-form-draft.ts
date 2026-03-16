type InspectionDraftKeyOptions = {
  userId?: string | null;
  isPhotographicReport: boolean;
  prefillSiteId?: string;
  prefillArea?: string;
  prefillResponsibleId?: string;
  prefillGoal?: string;
  hasExplicitGoalPrefill?: boolean;
};

type InspectionDraftValues = {
  site_id?: string;
  setor_area?: string;
  responsavel_id?: string;
  objetivo?: string;
  tipo_inspecao?: string;
  metodologia?: string[];
};

function normalizeDraftSegment(value: string | undefined, fallback: string) {
  const normalized = (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return normalized.slice(0, 36) || fallback;
}

export function buildInspectionDraftStorageKey({
  userId,
  isPhotographicReport,
  prefillSiteId,
  prefillArea,
  prefillResponsibleId,
  prefillGoal,
  hasExplicitGoalPrefill,
}: InspectionDraftKeyOptions): string {
  const scope = [isPhotographicReport ? "photographic" : "standard"];

  if (
    isPhotographicReport ||
    prefillSiteId ||
    prefillArea ||
    prefillResponsibleId ||
    (hasExplicitGoalPrefill && prefillGoal)
  ) {
    scope.push(normalizeDraftSegment(prefillSiteId, "site"));
    scope.push(normalizeDraftSegment(prefillArea, "area"));
    scope.push(normalizeDraftSegment(prefillResponsibleId, "responsavel"));
    if (hasExplicitGoalPrefill && prefillGoal) {
      scope.push(normalizeDraftSegment(prefillGoal, "objetivo"));
    }
  }

  return `inspection.form.draft.${userId || "anon"}.${scope.join(".")}`;
}

export function mergeInspectionDraftWithPrefill<T extends InspectionDraftValues>(
  values: T,
  {
    isPhotographicReport,
    prefillSiteId,
    prefillArea,
    prefillResponsibleId,
    prefillGoal,
    hasExplicitGoalPrefill,
  }: Omit<InspectionDraftKeyOptions, "userId">,
): T {
  const next = { ...values };

  if (prefillSiteId) {
    next.site_id = prefillSiteId;
  }

  if (prefillArea) {
    next.setor_area = prefillArea;
  }

  if (prefillResponsibleId) {
    next.responsavel_id = prefillResponsibleId;
  }

  if (hasExplicitGoalPrefill && prefillGoal) {
    next.objetivo = prefillGoal;
  }

  if (isPhotographicReport) {
    next.tipo_inspecao = "Especial";
    next.metodologia = Array.from(
      new Set([
        ...(Array.isArray(next.metodologia) ? next.metodologia : []),
        "Observação direta em campo",
        "Registro fotográfico",
      ]),
    );
  }

  return next;
}
