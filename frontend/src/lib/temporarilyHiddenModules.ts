const TEMPORARILY_HIDDEN_DASHBOARD_PREFIXES = [] as const;

export function isTemporarilyHiddenDashboardRoute(
  path?: string | null,
): boolean {
  if (!path) return false;

  const beforeQuery = path.split('?')[0]!;
  const normalizedPath = beforeQuery.split('#')[0]!;

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
