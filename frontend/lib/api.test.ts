import api, { buildRefreshRequestHeaders } from './api';
import { sessionStore } from './sessionStore';
import { tokenStore } from './tokenStore';
import { selectedTenantStore } from './selectedTenantStore';
import { AxiosError } from 'axios';

describe('api client', () => {
  beforeEach(() => {
    tokenStore.clear();
    sessionStore.clear();
    selectedTenantStore.clear();
  });

  it('bloqueia rota protegida sem access token em memória', async () => {
    await expect(
      api.get('/users', {
        adapter: async (config) => ({
          data: {},
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        }),
      }),
    ).rejects.toMatchObject({
      code: 'ERR_AUTH_REQUIRED',
      response: { status: 401 },
    });
  });

  it('anexa Bearer token, x-company-id e limita paginação no request global', async () => {
    tokenStore.set('access-token');
    sessionStore.set({
      userId: 'user-1',
      companyId: 'company-1',
      user: {
        id: 'user-1',
        companyId: 'company-1',
        isAdminGeral: false,
      },
    });

    const response = await api.get('/users', {
      params: { page: 1, limit: 200 },
      adapter: async (config) => ({
        data: {
          authorization: config.headers.Authorization,
          companyId: config.headers['x-company-id'],
          limit: (config.params as { limit?: number }).limit,
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      }),
    });

    expect(response.data).toEqual({
      authorization: 'Bearer access-token',
      companyId: 'company-1',
      limit: 100,
    });
  });

  it('não usa a empresa da sessão como tenant implícito para admin geral sem seleção explícita', async () => {
    tokenStore.set('access-token');
    sessionStore.set({
      userId: 'admin-1',
      companyId: 'company-admin',
      user: {
        id: 'admin-1',
        companyId: 'company-admin',
        isAdminGeral: true,
      },
    });

    const response = await api.get('/companies', {
      adapter: async (config) => ({
        data: {
          authorization: config.headers.Authorization,
          companyId: config.headers['x-company-id'],
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      }),
    });

    expect(response.data).toEqual({
      authorization: 'Bearer access-token',
      companyId: undefined,
    });
  });

  it('usa somente a empresa selecionada como tenant explícito para admin geral', async () => {
    tokenStore.set('access-token');
    sessionStore.set({
      userId: 'admin-1',
      companyId: 'company-admin',
      user: {
        id: 'admin-1',
        companyId: 'company-admin',
        isAdminGeral: true,
      },
    });
    selectedTenantStore.set({
      companyId: 'company-tenant-2',
      companyName: 'Tenant 2',
    });

    const response = await api.get('/dashboard/summary', {
      adapter: async (config) => ({
        data: {
          authorization: config.headers.Authorization,
          companyId: config.headers['x-company-id'],
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      }),
    });

    expect(response.data).toEqual({
      authorization: 'Bearer access-token',
      companyId: 'company-tenant-2',
    });
  });

  it('não anexa Bearer token em endpoint público de CSRF', async () => {
    tokenStore.set('access-token');
    sessionStore.set({
      userId: 'admin-1',
      companyId: 'company-admin',
      user: {
        id: 'admin-1',
        companyId: 'company-admin',
        isAdminGeral: true,
      },
    });

    const response = await api.get('/auth/csrf', {
      adapter: async (config) => ({
        data: {
          authorization: config.headers.Authorization,
          companyId: config.headers['x-company-id'],
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      }),
    });

    expect(response.data).toEqual({
      authorization: undefined,
      companyId: undefined,
    });
  });

  it('limpa tenant selecionado stale em erro de contexto sem cair no tenant da sessão do admin geral', async () => {
    tokenStore.set('access-token');
    sessionStore.set({
      userId: 'admin-1',
      companyId: 'company-admin',
      user: {
        id: 'admin-1',
        companyId: 'company-admin',
        isAdminGeral: true,
      },
    });
    selectedTenantStore.set({
      companyId: 'deleted-company',
      companyName: 'Empresa removida',
    });

    let calls = 0;

    const response = await api.get('/dds', {
      adapter: async (config) => {
        calls += 1;

        if (calls === 1) {
          throw new AxiosError(
            'tenant inválido',
            'ERR_BAD_REQUEST',
            config,
            {},
            {
              data: {
                message:
                  'Contexto de empresa inválido. Faça login novamente ou selecione uma empresa válida.',
              },
              status: 400,
              statusText: 'Bad Request',
              headers: {},
              config,
            },
          );
        }

        return {
          data: {
            calls,
            companyId: config.headers['x-company-id'],
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      },
    });

    expect(response.data).toEqual({
      calls: 2,
      companyId: undefined,
    });
    expect(selectedTenantStore.get()).toBeNull();
  });

  it('monta headers de refresh com x-csrf-token e x-refresh-csrf', () => {
    expect(
      buildRefreshRequestHeaders('csrf-token', 'refresh-csrf-token'),
    ).toEqual({
      'x-csrf-token': 'csrf-token',
      'x-refresh-csrf': 'refresh-csrf-token',
    });
  });
});
