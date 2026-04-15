import api from '@/lib/api';
import { activitiesService } from '@/services/activitiesService';
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

const mockPaginatedResponse = {
  data: [{ id: 'act-1', nome: 'Inspeção de altura', company_id: 'co-1', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }],
  page: 1,
  limit: 20,
  total: 1,
  lastPage: 1,
};

describe('activitiesService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('busca a primeira página com parâmetros padrão quando nenhuma opção é passada', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: mockPaginatedResponse });

    const result = await activitiesService.findPaginated();

    expect(api.get).toHaveBeenCalledWith('/activities', {
      params: { page: 1, limit: 20 },
    });
    expect(result).toEqual(mockPaginatedResponse);
  });

  it('envia page e limit customizados na paginação de atividades', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: mockPaginatedResponse });

    await activitiesService.findPaginated({ page: 3, limit: 50 });

    expect(api.get).toHaveBeenCalledWith('/activities', {
      params: { page: 3, limit: 50 },
    });
  });

  it('inclui o parâmetro search quando fornecido em findPaginated', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: mockPaginatedResponse });

    await activitiesService.findPaginated({ search: 'Inspeção' });

    expect(api.get).toHaveBeenCalledWith('/activities', {
      params: { page: 1, limit: 20, search: 'Inspeção' },
    });
  });

  it('inclui company_id quando companyId é fornecido em findPaginated', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: mockPaginatedResponse });

    await activitiesService.findPaginated({ companyId: 'co-99' });

    expect(api.get).toHaveBeenCalledWith('/activities', {
      params: { page: 1, limit: 20, company_id: 'co-99' },
    });
  });

  it('envia todos os parâmetros opcionais simultaneamente em findPaginated', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: mockPaginatedResponse });

    await activitiesService.findPaginated({ page: 2, limit: 10, search: 'Içamento', companyId: 'co-5' });

    expect(api.get).toHaveBeenCalledWith('/activities', {
      params: { page: 2, limit: 10, search: 'Içamento', company_id: 'co-5' },
    });
  });

  it('propaga erro quando o backend falha em findPaginated', async () => {
    const error = { response: { status: 500 } };
    (api.get as jest.Mock).mockRejectedValue(error);

    await expect(activitiesService.findPaginated()).rejects.toBe(error);
  });

  it('delega findAll ao fetchAllPages com limit 100 e maxPages 50', async () => {
    const allItems = [{ id: 'act-1', nome: 'Inspeção', company_id: 'co-1', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }];
    (fetchAllPages as jest.Mock).mockResolvedValue(allItems);

    const result = await activitiesService.findAll('co-1');

    expect(fetchAllPages).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100, maxPages: 50 }),
    );
    expect(result).toEqual(allItems);
  });

  it('chama findAll sem companyId e repassa undefined ao fetchAllPages', async () => {
    (fetchAllPages as jest.Mock).mockResolvedValue([]);

    await activitiesService.findAll();

    expect(fetchAllPages).toHaveBeenCalledTimes(1);
  });

  it('propaga erro quando fetchAllPages falha em findAll', async () => {
    const error = new Error('network failure');
    (fetchAllPages as jest.Mock).mockRejectedValue(error);

    await expect(activitiesService.findAll()).rejects.toBe(error);
  });

  it('retorna a atividade correta em findOne', async () => {
    const activity = { id: 'act-1', nome: 'Inspeção de altura', company_id: 'co-1', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
    (api.get as jest.Mock).mockResolvedValue({ data: activity });

    const result = await activitiesService.findOne('act-1');

    expect(api.get).toHaveBeenCalledWith('/activities/act-1');
    expect(result).toEqual(activity);
  });

  it('propaga erro quando o backend falha em findOne', async () => {
    const error = { response: { status: 404 } };
    (api.get as jest.Mock).mockRejectedValue(error);

    await expect(activitiesService.findOne('act-inexistente')).rejects.toBe(error);
  });

  it('cria uma atividade e retorna o recurso criado pelo backend', async () => {
    const created = { id: 'act-2', nome: 'Trabalho em altura', company_id: 'co-1', createdAt: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' };
    (api.post as jest.Mock).mockResolvedValue({ data: created });

    const result = await activitiesService.create({ nome: 'Trabalho em altura', company_id: 'co-1' });

    expect(api.post).toHaveBeenCalledWith('/activities', { nome: 'Trabalho em altura', company_id: 'co-1' });
    expect(result).toEqual(created);
  });

  it('propaga erro quando o backend falha ao criar atividade', async () => {
    const error = { response: { status: 422 } };
    (api.post as jest.Mock).mockRejectedValue(error);

    await expect(activitiesService.create({ nome: '' })).rejects.toBe(error);
  });

  it('atualiza uma atividade e retorna o recurso atualizado', async () => {
    const updated = { id: 'act-1', nome: 'Inspeção revisada', company_id: 'co-1', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-02-01T00:00:00Z' };
    (api.patch as jest.Mock).mockResolvedValue({ data: updated });

    const result = await activitiesService.update('act-1', { nome: 'Inspeção revisada' });

    expect(api.patch).toHaveBeenCalledWith('/activities/act-1', { nome: 'Inspeção revisada' });
    expect(result).toEqual(updated);
  });

  it('propaga erro quando o backend falha ao atualizar atividade', async () => {
    const error = { response: { status: 403 } };
    (api.patch as jest.Mock).mockRejectedValue(error);

    await expect(activitiesService.update('act-1', { nome: 'Novo nome' })).rejects.toBe(error);
  });

  it('exclui a atividade chamando DELETE na rota canônica', async () => {
    (api.delete as jest.Mock).mockResolvedValue({});

    await activitiesService.delete('act-1');

    expect(api.delete).toHaveBeenCalledWith('/activities/act-1');
  });

  it('propaga erro quando o backend falha ao excluir atividade', async () => {
    const error = { response: { status: 409 } };
    (api.delete as jest.Mock).mockRejectedValue(error);

    await expect(activitiesService.delete('act-1')).rejects.toBe(error);
  });
});
