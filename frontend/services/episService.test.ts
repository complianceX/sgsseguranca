import api from '@/lib/api';
import { episService } from '@/services/episService';
import { fetchAllPages } from '@/services/pagination';

jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('@/services/pagination', () => ({
  fetchAllPages: jest.fn(),
}));

const mockEpi = {
  id: 'epi-1',
  nome: 'Capacete de segurança',
  ca: '12345',
  validade_ca: '2027-12-31',
  descricao: 'Capacete tipo I',
  company_id: 'co-1',
  status: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const mockPaginatedResponse = {
  data: [mockEpi],
  page: 1,
  limit: 20,
  total: 1,
  lastPage: 1,
};

describe('episService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── findPaginated ────────────────────────────────────────────────────────────

  it('busca a primeira página com parâmetros padrão quando nenhuma opção é passada', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: mockPaginatedResponse });

    const result = await episService.findPaginated();

    expect(api.get).toHaveBeenCalledWith('/epis', {
      params: { page: 1, limit: 20 },
    });
    expect(result).toEqual(mockPaginatedResponse);
  });

  it('envia page e limit customizados na paginação de EPIs', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: mockPaginatedResponse });

    await episService.findPaginated({ page: 4, limit: 25 });

    expect(api.get).toHaveBeenCalledWith('/epis', {
      params: { page: 4, limit: 25 },
    });
  });

  it('inclui o parâmetro search quando fornecido em findPaginated', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: mockPaginatedResponse });

    await episService.findPaginated({ search: 'Capacete' });

    expect(api.get).toHaveBeenCalledWith('/epis', {
      params: { page: 1, limit: 20, search: 'Capacete' },
    });
  });

  it('envia companyId no header tenant-scoped em findPaginated', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: mockPaginatedResponse });

    await episService.findPaginated({ companyId: 'co-7' });

    expect(api.get).toHaveBeenCalledWith('/epis', {
      params: { page: 1, limit: 20 },
      headers: { 'x-company-id': 'co-7' },
    });
  });

  it('envia todos os parâmetros opcionais simultaneamente em findPaginated', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: mockPaginatedResponse });

    await episService.findPaginated({ page: 2, limit: 30, search: 'Luva', companyId: 'co-3' });

    expect(api.get).toHaveBeenCalledWith('/epis', {
      params: { page: 2, limit: 30, search: 'Luva' },
      headers: { 'x-company-id': 'co-3' },
    });
  });

  it('propaga erro quando o backend falha em findPaginated', async () => {
    const error = { response: { status: 503 } };
    (api.get as jest.Mock).mockRejectedValue(error);

    await expect(episService.findPaginated()).rejects.toBe(error);
  });

  // ── findAll ──────────────────────────────────────────────────────────────────

  it('delega findAll ao fetchAllPages com limit 100 e maxPages 50', async () => {
    const allEpis = [mockEpi];
    (fetchAllPages as jest.Mock).mockResolvedValue(allEpis);

    const result = await episService.findAll('co-1');

    expect(fetchAllPages).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100, maxPages: 50 }),
    );
    expect(result).toEqual(allEpis);
  });

  it('chama findAll sem companyId sem lançar exceção', async () => {
    (fetchAllPages as jest.Mock).mockResolvedValue([]);

    await expect(episService.findAll()).resolves.toEqual([]);
    expect(fetchAllPages).toHaveBeenCalledTimes(1);
  });

  it('propaga erro quando fetchAllPages falha em findAll', async () => {
    const error = new Error('timeout');
    (fetchAllPages as jest.Mock).mockRejectedValue(error);

    await expect(episService.findAll('co-1')).rejects.toBe(error);
  });

  // ── findOne ──────────────────────────────────────────────────────────────────

  it('retorna o EPI correto em findOne pela rota canônica', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: mockEpi });

    const result = await episService.findOne('epi-1');

    expect(api.get).toHaveBeenCalledWith('/epis/epi-1');
    expect(result).toEqual(mockEpi);
  });

  it('propaga erro quando o backend falha em findOne', async () => {
    const error = { response: { status: 404 } };
    (api.get as jest.Mock).mockRejectedValue(error);

    await expect(episService.findOne('epi-inexistente')).rejects.toBe(error);
  });

  // ── create ───────────────────────────────────────────────────────────────────

  it('cria um EPI e retorna o recurso criado pelo backend', async () => {
    (api.post as jest.Mock).mockResolvedValue({ data: mockEpi });

    const result = await episService.create({ nome: 'Capacete de segurança', company_id: 'co-1', status: true });

    expect(api.post).toHaveBeenCalledWith('/epis', { nome: 'Capacete de segurança', company_id: 'co-1', status: true });
    expect(result).toEqual(mockEpi);
  });

  it('propaga erro quando o backend falha ao criar EPI', async () => {
    const error = { response: { status: 422 } };
    (api.post as jest.Mock).mockRejectedValue(error);

    await expect(episService.create({ nome: '' })).rejects.toBe(error);
  });

  // ── update ───────────────────────────────────────────────────────────────────

  it('atualiza um EPI e retorna o recurso atualizado', async () => {
    const updated = { ...mockEpi, nome: 'Capacete tipo II' };
    (api.patch as jest.Mock).mockResolvedValue({ data: updated });

    const result = await episService.update('epi-1', { nome: 'Capacete tipo II' });

    expect(api.patch).toHaveBeenCalledWith('/epis/epi-1', { nome: 'Capacete tipo II' });
    expect(result).toEqual(updated);
  });

  it('propaga erro quando o backend falha ao atualizar EPI', async () => {
    const error = { response: { status: 403 } };
    (api.patch as jest.Mock).mockRejectedValue(error);

    await expect(episService.update('epi-1', { nome: 'X' })).rejects.toBe(error);
  });

  // ── delete ───────────────────────────────────────────────────────────────────

  it('exclui o EPI chamando DELETE na rota canônica', async () => {
    (api.delete as jest.Mock).mockResolvedValue({});

    await episService.delete('epi-1');

    expect(api.delete).toHaveBeenCalledWith('/epis/epi-1');
  });

  it('propaga erro quando o backend falha ao excluir EPI', async () => {
    const error = { response: { status: 409 } };
    (api.delete as jest.Mock).mockRejectedValue(error);

    await expect(episService.delete('epi-1')).rejects.toBe(error);
  });
});
