import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { resolveSiteAccessScope, isCompanyWideProfile, type ResolvedSiteAccessScope } from './site-access-scope.util';
import { TenantService } from './tenant.service';
import { Role } from '../../modules/auth/enums/roles.enum';

// Helper para verificar se um site é visível para o escopo
function isSiteVisibleToScope(siteId: string, scope: Pick<ResolvedSiteAccessScope, 'hasCompanyWideAccess' | 'siteIds'>): boolean {
  if (scope.hasCompanyWideAccess) {
    return true;
  }
  return scope.siteIds.includes(siteId);
}

describe('site-access-scope.util', () => {
  describe('resolveSiteAccessScope', () => {
    const makeTenantContext = (overrides: {
      companyId: string;
      isSuperAdmin?: boolean;
      userId?: string;
      siteId?: string;
      siteIds?: string[];
      siteScope?: 'single' | 'all';
    } = { companyId: 'company-1' }) => ({
      companyId: overrides.companyId,
      isSuperAdmin: overrides.isSuperAdmin ?? false,
      userId: overrides.userId ?? 'user-1',
      siteId: overrides.siteId,
      siteIds: overrides.siteIds ?? [],
      siteScope: overrides.siteScope ?? 'single',
    });

    it('lança erro quando companyId não está definido', () => {
      const context = makeTenantContext({ companyId: '' });

      expect(() => resolveSiteAccessScope(context, 'test-module')).toThrow(
        BadRequestException,
      );
    });

    it('retorna escopo restrito para TST com obras específicas', () => {
      const context = makeTenantContext({
        companyId: 'company-1',
        siteIds: ['site-1', 'site-2'],
        siteScope: 'single',
      });

      // Sobrescrever o RequestContext.get para retornar TST
      const originalGet = (require('../middleware/request-context.middleware') as any).RequestContext?.get;
      (require('../middleware/request-context.middleware') as any).RequestContext = {
        get: () => Role.TST,
      };

      try {
        const result = resolveSiteAccessScope(context, 'test-module');

        expect(result.hasCompanyWideAccess).toBe(false);
        expect(result.siteScope).toBe('single');
        expect(result.siteIds).toContain('site-1');
        expect(result.siteIds).toContain('site-2');
      } finally {
        // Restaurar
        if (originalGet) {
          (require('../middleware/request-context.middleware') as any).RequestContext.get = originalGet;
        }
      }
    });

    it('lança erro quando siteScope é single mas não há siteIds', () => {
      const context = makeTenantContext({
        companyId: 'company-1',
        siteIds: [],
        siteScope: 'single',
      });

      const originalGet = (require('../middleware/request-context.middleware') as any).RequestContext?.get;
      (require('../middleware/request-context.middleware') as any).RequestContext = {
        get: () => Role.TST,
      };

      try {
        expect(() => resolveSiteAccessScope(context, 'test-module')).toThrow(
          BadRequestException,
        );
      } finally {
        if (originalGet) {
          (require('../middleware/request-context.middleware') as any).RequestContext.get = originalGet;
        }
      }
    });

    it('permite siteIds vazio com allowMissingSiteScope para catálogos', () => {
      const context = makeTenantContext({
        companyId: 'company-1',
        siteIds: [],
        siteScope: 'single',
      });

      const originalGet = (require('../middleware/request-context.middleware') as any).RequestContext?.get;
      (require('../middleware/request-context.middleware') as any).RequestContext = {
        get: () => Role.TST,
      };

      try {
        const result = resolveSiteAccessScope(context, 'test-module', {
          allowMissingSiteScope: true,
        });

        expect(result.siteIds).toEqual([]);
        expect(result.siteScope).toBe('single');
      } finally {
        if (originalGet) {
          (require('../middleware/request-context.middleware') as any).RequestContext.get = originalGet;
        }
      }
    });
  });

  describe('isCompanyWideProfile', () => {
    it('retorna true para ADMIN_GERAL', () => {
      expect(isCompanyWideProfile(Role.ADMIN_GERAL)).toBe(true);
    });

    it('retorna true para ADMIN_EMPRESA', () => {
      expect(isCompanyWideProfile(Role.ADMIN_EMPRESA)).toBe(true);
    });

    it('retorna false para TST', () => {
      expect(isCompanyWideProfile(Role.TST)).toBe(false);
    });

    it('retorna false para Supervisor', () => {
      expect(isCompanyWideProfile(Role.SUPERVISOR)).toBe(false);
    });
  });
});

describe('Isolamento cross-obra', () => {
  const makeScope = (siteIds: string[], hasCompanyWideAccess = false): Pick<ResolvedSiteAccessScope, 'hasCompanyWideAccess' | 'siteId' | 'siteIds'> => ({
    hasCompanyWideAccess,
    siteId: siteIds[0],
    siteIds,
  });

  it('TST com acesso apenas à Obra X não vê dados da Obra Y', () => {
    const scope = makeScope(['site-x']);

    expect(isSiteVisibleToScope('site-x', scope)).toBe(true);
    expect(isSiteVisibleToScope('site-y', scope)).toBe(false);
  });

  it('TST com acesso às Obras X e Y vê ambas', () => {
    const scope = makeScope(['site-x', 'site-y']);

    expect(isSiteVisibleToScope('site-x', scope)).toBe(true);
    expect(isSiteVisibleToScope('site-y', scope)).toBe(true);
  });

  it('ADM_EMPRESA vê todas as obras da empresa', () => {
    const scope = makeScope(['site-x', 'site-y'], true);

    expect(isSiteVisibleToScope('site-x', scope)).toBe(true);
    expect(isSiteVisibleToScope('site-y', scope)).toBe(true);
    expect(isSiteVisibleToScope('site-z', scope)).toBe(true);
  });

  it('ADMIN_GERAL vê todas as obras', () => {
    const scope = makeScope([], true);

    expect(isSiteVisibleToScope('site-x', scope)).toBe(true);
    expect(isSiteVisibleToScope('site-y', scope)).toBe(true);
  });
});
