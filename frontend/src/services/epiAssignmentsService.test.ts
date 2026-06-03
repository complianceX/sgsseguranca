import api from '@/lib/api';
import { fetchAllPages } from './pagination';
import { epiAssignmentsService } from './epiAssignmentsService';

jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('./pagination', () => ({
  fetchAllPages: jest.fn(),
}));

describe('epiAssignmentsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('consulta lookup de colaboradores do EPI', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      data: { data: [], page: 1, limit: 20, total: 0, lastPage: 1 },
    });

    await epiAssignmentsService.findLookupUsers({
      page: 4,
      limit: 30,
      search: 'Carlos',
    });

    expect(api.get).toHaveBeenCalledWith('/epi-assignments/lookups/users', {
      params: { page: 4, limit: 30, search: 'Carlos' },
    });
  });

  it('consulta lookup de EPIs com paginação', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      data: { data: [], page: 1, limit: 20, total: 0, lastPage: 1 },
    });

    await epiAssignmentsService.findLookupEpis({
      page: 1,
      limit: 20,
      search: 'Luva',
    });

    expect(api.get).toHaveBeenCalledWith('/epi-assignments/lookups/epis', {
      params: { page: 1, limit: 20, search: 'Luva' },
    });
  });

  it('faz fetch completo dos lookups com cache estável', async () => {
    (fetchAllPages as jest.Mock)
      .mockResolvedValueOnce([{ id: 'u-1', nome: 'Carlos' }])
      .mockResolvedValueOnce([{ id: 'epi-1', nome: 'Luva' }]);

    const users = await epiAssignmentsService.findAllLookupUsers('Carlos');
    const epis = await epiAssignmentsService.findAllLookupEpis('Luva');

    expect(fetchAllPages).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        limit: 100,
        maxPages: 50,
        cacheKey:
          'GET:/epi-assignments/lookups/users?page=*&limit=100&search=Carlos',
      }),
    );
    expect(fetchAllPages).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        limit: 100,
        maxPages: 50,
        cacheKey:
          'GET:/epi-assignments/lookups/epis?page=*&limit=100&search=Luva',
      }),
    );
    expect(users).toEqual([{ id: 'u-1', nome: 'Carlos' }]);
    expect(epis).toEqual([{ id: 'epi-1', nome: 'Luva' }]);
  });
});
