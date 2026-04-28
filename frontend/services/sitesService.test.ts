import api from '@/lib/api';
import { sitesService } from '@/services/sitesService';
import { fetchAllPages } from '@/services/pagination';
import {
  setOfflineCache,
  consumeOfflineCache,
  isOfflineRequestError,
  CACHE_TTL,
} from '@/lib/offline-cache';

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

jest.mock('@/lib/offline-cache', () => ({
  setOfflineCache: jest.fn(),
  consumeOfflineCache: jest.fn(),
  isOfflineRequestError: jest.fn(),
  CACHE_TTL: { REFERENCE: 300000 },
}));

const mockSite = {
  id: 'site-1',
  nome: 'Planta SP',
  endereco: 'Av. Paulista, 1000',
  cidade: 'São Paulo',
  estado: 'SP',
  company_id: 'co-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const mockPaginatedResponse = {
  data: [mockSite],
  page: 1,
  limit: 20,
  total: 1,
  lastPage: 1,
};

describe('sitesService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isOfflineRequestError as jest.Mock).mockReturnValue(false);
  });

  // ── findPaginated ────────────────────────────────────────────────────────────

  it('busca a primeira página com parâmetros padrão e grava cache offline', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: mockPaginatedResponse });

    const result = await sitesService.findPaginated();

    expect(api.get).toHaveBeenCalledWith('/sites', {
      params: { page: 1, limit: 20 },
    });
    expect(setOfflineCache).toHaveBeenCalledWith(
      expect.stringContaining('sites.paginated.'),
      mockPaginatedResponse,
      CACHE_TTL.REFERENCE,
    );
    expect(result).toEqual(mockPaginatedResponse);
  });

  it('envia todos os parâmetros opcionais em findPaginated', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: mockPaginatedResponse });

    await sitesService.findPaginated({ page: 2, limit: 5, search: 'Planta', companyId: 'co-2' });

    expect(api.get).toHaveBeenCalledWith('/sites', {
      params: { page: 2, limit: 5, search: 'Planta' },
      headers: { 'x-company-id': 'co-2' },
    });
  });

  it('retorna o cache offline em findPaginated quando o erro é de conectividade e cache existe', async () => {
    const networkError = { code: 'ERR_NETWORK' };
    (api.get as jest.Mock).mockRejectedValue(networkError);
    (isOfflineRequestError as jest.Mock).mockReturnValue(true);
    (consumeOfflineCache as jest.Mock).mockReturnValue(mockPaginatedResponse);

    const result = await sitesService.findPaginated();

    expect(consumeOfflineCache).toHaveBeenCalled();
    expect(result).toEqual(mockPaginatedResponse);
  });

  it('relança o erro em findPaginated quando é offline mas o cache está vazio', async () => {
    const networkError = { code: 'ERR_NETWORK' };
    (api.get as jest.Mock).mockRejectedValue(networkError);
    (isOfflineRequestError as jest.Mock).mockReturnValue(true);
    (consumeOfflineCache as jest.Mock).mockReturnValue(null);

    await expect(sitesService.findPaginated()).rejects.toBe(networkError);
  });

  it('propaga erro de servidor em findPaginated sem consultar cache', async () => {
    const serverError = { response: { status: 500 } };
    (api.get as jest.Mock).mockRejectedValue(serverError);
    (isOfflineRequestError as jest.Mock).mockReturnValue(false);

    await expect(sitesService.findPaginated()).rejects.toBe(serverError);
    expect(consumeOfflineCache).not.toHaveBeenCalled();
  });

  // ── findAll ──────────────────────────────────────────────────────────────────

  it('delega findAll ao fetchAllPages e grava cache offline com o resultado', async () => {
    const allSites = [mockSite];
    (fetchAllPages as jest.Mock).mockResolvedValue(allSites);

    const result = await sitesService.findAll('co-1');

    expect(fetchAllPages).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100, maxPages: 50 }),
    );
    expect(setOfflineCache).toHaveBeenCalledWith('sites.all.co-1', allSites, CACHE_TTL.REFERENCE);
    expect(result).toEqual(allSites);
  });

  it('usa chave de cache "sites.all.all" quando companyId não é informado', async () => {
    (fetchAllPages as jest.Mock).mockResolvedValue([]);

    await sitesService.findAll();

    expect(setOfflineCache).toHaveBeenCalledWith('sites.all.all', [], CACHE_TTL.REFERENCE);
  });

  it('retorna o cache offline em findAll quando fetchAllPages falha por conectividade', async () => {
    const networkError = { code: 'ERR_NETWORK' };
    (fetchAllPages as jest.Mock).mockRejectedValue(networkError);
    (isOfflineRequestError as jest.Mock).mockReturnValue(true);
    (consumeOfflineCache as jest.Mock).mockReturnValue([mockSite]);

    const result = await sitesService.findAll('co-1');

    expect(result).toEqual([mockSite]);
  });

  it('relança o erro em findAll quando é offline mas o cache está vazio', async () => {
    const networkError = { code: 'ERR_NETWORK' };
    (fetchAllPages as jest.Mock).mockRejectedValue(networkError);
    (isOfflineRequestError as jest.Mock).mockReturnValue(true);
    (consumeOfflineCache as jest.Mock).mockReturnValue(null);

    await expect(sitesService.findAll()).rejects.toBe(networkError);
  });

  // ── findOne ──────────────────────────────────────────────────────────────────

  it('retorna o site correto em findOne e grava cache offline', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: mockSite });

    const result = await sitesService.findOne('site-1');

    expect(api.get).toHaveBeenCalledWith('/sites/site-1');
    expect(setOfflineCache).toHaveBeenCalledWith('sites.one.site-1', mockSite, CACHE_TTL.REFERENCE);
    expect(result).toEqual(mockSite);
  });

  it('retorna o cache offline em findOne quando a requisição falha por conectividade', async () => {
    const networkError = { code: 'ERR_NETWORK' };
    (api.get as jest.Mock).mockRejectedValue(networkError);
    (isOfflineRequestError as jest.Mock).mockReturnValue(true);
    (consumeOfflineCache as jest.Mock).mockReturnValue(mockSite);

    const result = await sitesService.findOne('site-1');

    expect(result).toEqual(mockSite);
  });

  it('relança o erro em findOne quando é offline e cache está vazio', async () => {
    const networkError = { code: 'ERR_NETWORK' };
    (api.get as jest.Mock).mockRejectedValue(networkError);
    (isOfflineRequestError as jest.Mock).mockReturnValue(true);
    (consumeOfflineCache as jest.Mock).mockReturnValue(null);

    await expect(sitesService.findOne('site-1')).rejects.toBe(networkError);
  });

  it('propaga erro de servidor em findOne sem consultar cache', async () => {
    const serverError = { response: { status: 403 } };
    (api.get as jest.Mock).mockRejectedValue(serverError);
    (isOfflineRequestError as jest.Mock).mockReturnValue(false);

    await expect(sitesService.findOne('site-1')).rejects.toBe(serverError);
    expect(consumeOfflineCache).not.toHaveBeenCalled();
  });

  // ── create / update / delete ─────────────────────────────────────────────────

  it('cria um site e retorna o recurso criado pelo backend', async () => {
    (api.post as jest.Mock).mockResolvedValue({ data: mockSite });

    const result = await sitesService.create({ nome: 'Planta SP', company_id: 'co-1' });

    expect(api.post).toHaveBeenCalledWith('/sites', { nome: 'Planta SP' }, { headers: { 'x-company-id': 'co-1' } });
    expect(result).toEqual(mockSite);
  });

  it('propaga erro quando o backend falha ao criar site', async () => {
    const error = { response: { status: 422 } };
    (api.post as jest.Mock).mockRejectedValue(error);

    await expect(sitesService.create({ nome: '' })).rejects.toBe(error);
  });

  it('atualiza um site e retorna o recurso atualizado', async () => {
    const updated = { ...mockSite, nome: 'Planta RJ' };
    (api.patch as jest.Mock).mockResolvedValue({ data: updated });

    const result = await sitesService.update('site-1', { nome: 'Planta RJ' });

    expect(api.patch).toHaveBeenCalledWith('/sites/site-1', { nome: 'Planta RJ' }, { headers: {} });
    expect(result).toEqual(updated);
  });

  it('propaga erro quando o backend falha ao atualizar site', async () => {
    const error = { response: { status: 409 } };
    (api.patch as jest.Mock).mockRejectedValue(error);

    await expect(sitesService.update('site-1', { nome: 'X' })).rejects.toBe(error);
  });

  it('exclui o site chamando DELETE na rota canônica', async () => {
    (api.delete as jest.Mock).mockResolvedValue({});

    await sitesService.delete('site-1');

    expect(api.delete).toHaveBeenCalledWith('/sites/site-1');
  });

  it('propaga erro quando o backend falha ao excluir site', async () => {
    const error = { response: { status: 404 } };
    (api.delete as jest.Mock).mockRejectedValue(error);

    await expect(sitesService.delete('site-inexistente')).rejects.toBe(error);
  });
});
