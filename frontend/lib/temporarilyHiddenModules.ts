const TEMPORARILY_HIDDEN_DASHBOARD_PREFIXES = [
  '/dashboard/trainings',
  '/dashboard/medical-exams',
  '/dashboard/activities',
  '/dashboard/risks',
  '/dashboard/epis',
  '/dashboard/epi-fichas',
] as const;

export function isTemporarilyHiddenDashboardRoute(
  path?: string | null,
): boolean {
  if (!path) return false;

  const normalizedPath = path.split('?')[0].split('#')[0];

  return TEMPORARILY_HIDDEN_DASHBOARD_PREFIXES.some(
    (prefix) =>
      normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`),
  );
}

export function isTemporarilyVisibleDashboardRoute(
  path?: string | null,
): boolean {
  return !isTemporarilyHiddenDashboardRoute(path);
}
