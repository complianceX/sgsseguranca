import api from '@/lib/api';
import { fetchAllPages } from './pagination';
import { trainingsService } from './trainingsService';

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

describe('trainingsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('consulta lookup de colaboradores com tenant no header', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      data: { data: [], page: 1, limit: 20, total: 0, lastPage: 1 },
    });

    await trainingsService.findLookupUsers({
      page: 2,
      limit: 50,
      search: 'Joao',
      companyId: 'company-1',
    });

    expect(api.get).toHaveBeenCalledWith('/trainings/lookups/users', {
      params: { page: 2, limit: 50, search: 'Joao' },
      headers: { 'x-company-id': 'company-1' },
    });
  });

  it('carrega todos os colaboradores do lookup com cache por empresa', async () => {
    (fetchAllPages as jest.Mock).mockResolvedValue([{ id: 'u-1', nome: 'Ana' }]);

    const result = await trainingsService.findAllLookupUsers('company-2', 'Ana');

    expect(fetchAllPages).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 100,
        maxPages: 50,
        cacheKey:
          'GET:/trainings/lookups/users?page=*&limit=100&company_id=company-2&search=Ana',
      }),
    );
    expect(result).toEqual([{ id: 'u-1', nome: 'Ana' }]);
  });
});
