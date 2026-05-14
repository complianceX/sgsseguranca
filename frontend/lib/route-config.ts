/**
 * Fonte única de verdade para configuração de rotas do dashboard.
 *
 * ADMIN_ROUTES        — requer isAdminGeral para acesso direto.
 * PERMISSION_ROUTES   — rota requer permissão específica (exceção dentro de ADMIN_ROUTES).
 * HIDDEN_ROUTES       — módulos temporariamente desabilitados (redireciona para /dashboard).
 *
 * Para adicionar uma nova rota protegida:
 *   1. Se requer ADMIN_GERAL: adicione o prefixo em ADMIN_ROUTES.
 *   2. Se requer permissão granular: adicione em PERMISSION_ROUTES.
 *   3. Se temporariamente oculta: adicione em HIDDEN_ROUTES.
 */

export const ADMIN_ROUTES = [
  '/dashboard/companies',
  '/dashboard/sites',
  '/dashboard/users',
  '/dashboard/activities',
  '/dashboard/risks',
  '/dashboard/trainings',
  '/dashboard/medical-exams',
  '/dashboard/epis',
  '/dashboard/epi-fichas',
  '/dashboard/tools',
  '/dashboard/machines',
] as const;

export type AdminRoute = (typeof ADMIN_ROUTES)[number];

/**
 * Rotas dentro de ADMIN_ROUTES que podem ser acessadas com permissão
 * específica mesmo sem ser ADMIN_GERAL.
 */
export const PERMISSION_ROUTE_EXCEPTIONS: Array<{
  route: string;
  permission: string;
}> = [
  { route: '/dashboard/activities', permission: 'can_view_activities' },
  { route: '/dashboard/risks', permission: 'can_view_risks' },
  { route: '/dashboard/trainings', permission: 'can_view_trainings' },
  { route: '/dashboard/medical-exams', permission: 'can_view_medical_exams' },
  { route: '/dashboard/epis', permission: 'can_manage_catalogs' },
  { route: '/dashboard/epi-fichas', permission: 'can_view_epi_assignments' },
  { route: '/dashboard/tools', permission: 'can_manage_catalogs' },
  { route: '/dashboard/machines', permission: 'can_manage_catalogs' },
  { route: '/dashboard/sites', permission: 'can_manage_sites' },
  { route: '/dashboard/users', permission: 'can_manage_users' },
];

/**
 * Prefixos de rotas temporariamente ocultadas (feature flags de rollout).
 * Redireciona silenciosamente para /dashboard ao tentar acessar.
 */
export const HIDDEN_ROUTES = [
] as const;

export type HiddenRoute = (typeof HIDDEN_ROUTES)[number];

/** Retorna true se o pathname é uma rota exclusiva de ADMIN_GERAL. */
export function isAdminRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const clean = pathname.split('?')[0].split('#')[0];
  return ADMIN_ROUTES.some(
    (route) => clean === route || clean.startsWith(`${route}/`),
  );
}

/** Retorna true se o pathname está temporariamente oculto. */
export function isHiddenRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const clean = pathname.split('?')[0].split('#')[0];
  return HIDDEN_ROUTES.some(
    (prefix) => clean === prefix || clean.startsWith(`${prefix}/`),
  );
}

/**
 * Verifica se o pathname tem exceção de permissão granular
 * (usuário não-admin com permissão específica pode acessar).
 */
export function getRoutePermissionException(
  pathname: string | null | undefined,
): string | undefined {
  if (!pathname) return undefined;
  const clean = pathname.split('?')[0].split('#')[0];
  return PERMISSION_ROUTE_EXCEPTIONS.find(({ route }) =>
    clean.startsWith(route),
  )?.permission;
}
