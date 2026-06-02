import api from '@/lib/api';
import { fetchAllPages } from './pagination';
import { medicalExamsService } from './medicalExamsService';

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

describe('medicalExamsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('consulta lookup de colaboradores com paginação', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      data: { data: [], page: 1, limit: 20, total: 0, lastPage: 1 },
    });

    await medicalExamsService.findLookupUsers({
      page: 3,
      limit: 25,
      search: 'Maria',
    });

    expect(api.get).toHaveBeenCalledWith('/medical-exams/lookups/users', {
      params: { page: 3, limit: 25, search: 'Maria' },
    });
  });

  it('faz fetch completo do lookup com chave estável', async () => {
    (fetchAllPages as jest.Mock).mockResolvedValue([{ id: 'u-1', nome: 'Maria' }]);

    const result = await medicalExamsService.findAllLookupUsers('Maria');

    expect(fetchAllPages).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 100,
        maxPages: 50,
        cacheKey: 'GET:/medical-exams/lookups/users?page=*&limit=100&search=Maria',
      }),
    );
    expect(result).toEqual([{ id: 'u-1', nome: 'Maria' }]);
  });
});
