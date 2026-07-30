import { describe, expect, it } from '@jest/globals';
import { queryKeys, normalizeQueryFilters } from './query-keys';

jest.mock('./cache-scope', () => ({
  resolveBrowserCacheScope: () => 'test-scope',
}));

describe('queryKeys', () => {
  it('inclui companyId, siteId, paginação e filtros na key da APR', () => {
    const key = queryKeys.aprs.list({
      companyId: 'company-1',
      siteId: 'site-x',
      page: 1,
      limit: 20,
      filters: { status: 'Pendente', search: 'abc' },
    });

    expect(key[0]).toBe('aprs');
    expect(key[1]).toBe('list');
    expect(key[2]).toBe('company-1');
    expect(key[3]).toBe('site-x');
    expect(key[4]).toBe('1');
    expect(key[5]).toBe('20');
    // Normalização reordena chaves alfabeticamente
    const filtersJson = key[6];
    expect(filtersJson).toContain('"filters"');
    expect(filtersJson).toContain('"search":"abc"');
    expect(filtersJson).toContain('"status":"Pendente"');
  });

  it('gera key diferente para obras diferentes', () => {
    const x = queryKeys.aprs.list({ companyId: 'company-1', siteId: 'site-x', page: 1, limit: 20 });
    const y = queryKeys.aprs.list({ companyId: 'company-1', siteId: 'site-y', page: 1, limit: 20 });
    expect(x).not.toEqual(y);
  });

  it('gera key diferente para empresas diferentes', () => {
    const a = queryKeys.aprs.list({ companyId: 'company-a', siteId: 'site-x', page: 1, limit: 20 });
    const b = queryKeys.aprs.list({ companyId: 'company-b', siteId: 'site-x', page: 1, limit: 20 });
    expect(a).not.toEqual(b);
  });

  it('normaliza filtros com ordem diferente', () => {
    const a = normalizeQueryFilters({ b: 2, a: 1 });
    const b = normalizeQueryFilters({ a: 1, b: 2 });
    expect(a).toBe(b);
  });

  it('usa chaves distintas para detail/history/pdf/export', () => {
    const detail = queryKeys.aprs.detail({ aprId: 'apr-1', companyId: 'company-x', siteId: 'site-x' });
    const history = queryKeys.aprs.history({ aprId: 'apr-1', companyId: 'company-x', siteId: 'site-x' });
    const pdf = queryKeys.aprs.pdf({ aprId: 'apr-1', companyId: 'company-x', siteId: 'site-x' });

    expect(detail).not.toEqual(history);
    expect(detail).not.toEqual(pdf);
    expect(history).not.toEqual(pdf);
  });
});
