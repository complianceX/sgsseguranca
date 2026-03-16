type DateCandidate = Date | string | null | undefined;

export function coerceDocumentDate(input: DateCandidate): Date | null {
  if (!input) {
    return null;
  }

  const parsed = input instanceof Date ? input : new Date(input);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getIsoWeekNumber(input: DateCandidate): number | null {
  const date = coerceDocumentDate(input);
  if (!date) {
    return null;
  }

  const target = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  target.setUTCDate(target.getUTCDate() + 4 - (target.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(
    ((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
}

export function matchesDocumentWeekFilters(
  input: DateCandidate,
  filters: { year?: number; week?: number },
): boolean {
  const date = coerceDocumentDate(input);
  if (!date) {
    return false;
  }

  if (filters.year && date.getFullYear() !== filters.year) {
    return false;
  }

  if (filters.week) {
    const week = getIsoWeekNumber(date);
    if (week !== filters.week) {
      return false;
    }
  }

  return true;
}
