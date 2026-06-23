import {
  ADMIN_ROUTES,
  PERMISSION_ROUTE_EXCEPTIONS,
  getRoutePermissionException,
  isAdminRoute,
} from './route-config';

describe('route-config — rota /dashboard/dds (achado I1)', () => {
  describe('ADMIN_ROUTES', () => {
    it('inclui /dashboard/dds como rota protegida', () => {
      expect(ADMIN_ROUTES).toContain('/dashboard/dds');
    });

    it('isAdminRoute retorna true para /dashboard/dds', () => {
      expect(isAdminRoute('/dashboard/dds')).toBe(true);
    });

    it('isAdminRoute retorna true para sub-rotas de /dashboard/dds', () => {
      expect(isAdminRoute('/dashboard/dds/new')).toBe(true);
      expect(isAdminRoute('/dashboard/dds/edit/some-id')).toBe(true);
    });

    it('isAdminRoute retorna false para /dashboard/dds-outras-coisas (sem falso positivo)', () => {
      expect(isAdminRoute('/dashboard/dds-extras')).toBe(false);
    });
  });

  describe('PERMISSION_ROUTE_EXCEPTIONS', () => {
    it('inclui exceção can_view_dds para /dashboard/dds', () => {
      const exception = PERMISSION_ROUTE_EXCEPTIONS.find(
        (e) => e.route === '/dashboard/dds',
      );
      expect(exception).toBeDefined();
      expect(exception?.permission).toBe('can_view_dds');
    });

    it('getRoutePermissionException retorna can_view_dds para /dashboard/dds', () => {
      expect(getRoutePermissionException('/dashboard/dds')).toBe('can_view_dds');
    });

    it('getRoutePermissionException retorna can_view_dds para sub-rotas de DDS', () => {
      expect(getRoutePermissionException('/dashboard/dds/new')).toBe('can_view_dds');
      expect(getRoutePermissionException('/dashboard/dds/edit/123')).toBe('can_view_dds');
    });

    it('getRoutePermissionException retorna undefined para rotas não registradas', () => {
      expect(getRoutePermissionException('/dashboard/companies')).toBeUndefined();
    });

    it('getRoutePermissionException retorna undefined para null', () => {
      expect(getRoutePermissionException(null)).toBeUndefined();
    });
  });

  describe('regressão — exceções existentes não foram removidas', () => {
    const expectedExceptions = [
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

    test.each(expectedExceptions)(
      'mantém exceção $route → $permission',
      ({ route, permission }) => {
        expect(getRoutePermissionException(route)).toBe(permission);
      },
    );
  });
});