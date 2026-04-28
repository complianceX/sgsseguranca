import api from './api';
import { sessionStore } from './sessionStore';
import { tokenStore } from './tokenStore';

describe('api client', () => {
  beforeEach(() => {
    tokenStore.clear();
    sessionStore.clear();
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
      authorization: 'Bearer REDACTED',
      companyId: 'company-1',
      limit: 100,
    });
  });
});
