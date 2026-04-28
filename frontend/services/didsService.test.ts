import api from '@/lib/api';
import { didsService } from '@/services/didsService';
import {
  consumeOfflineCache,
  isOfflineRequestError,
  setOfflineCache,
} from '@/lib/offline-cache';

jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('@/lib/offline-cache', () => ({
  consumeOfflineCache: jest.fn(),
  isOfflineRequestError: jest.fn(),
  setOfflineCache: jest.fn(),
  CACHE_TTL: { LIST: 60000, RECORD: 300000 },
}));

describe('didsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isOfflineRequestError as jest.Mock).mockReturnValue(false);
  });

  it('busca DID paginado e persiste cache da listagem', async () => {
    const payload = { data: [], page: 1, limit: 10, total: 0, lastPage: 1 };
    (api.get as jest.Mock).mockResolvedValue({ data: payload });

    const result = await didsService.findPaginated({
      page: 1,
      limit: 10,
      search: 'montagem',
      status: 'alinhado',
    });

    expect(api.get).toHaveBeenCalledWith('/dids', {
      params: {
        page: 1,
        limit: 10,
        search: 'montagem',
        status: 'alinhado',
      },
    });
    expect(setOfflineCache).toHaveBeenCalled();
    expect(result).toEqual(payload);
  });

  it('retorna cache offline ao buscar DID paginado sem conexão', async () => {
    const cached = {
      data: [{ id: 'did-1' }],
      page: 1,
      limit: 20,
      total: 1,
      lastPage: 1,
    };
    (api.get as jest.Mock).mockRejectedValue({ code: 'ERR_NETWORK' });
    (isOfflineRequestError as jest.Mock).mockReturnValue(true);
    (consumeOfflineCache as jest.Mock).mockReturnValue(cached);

    const result = await didsService.findPaginated();

    expect(result).toBe(cached);
  });

  it('normaliza payload no create antes de enviar ao backend', async () => {
    (api.post as jest.Mock).mockResolvedValue({ data: { id: 'did-1' } });

    await didsService.create({
      titulo: 'DID de turno',
      descricao: '   ',
      data: '2026-04-15',
      turno: '',
      frente_trabalho: ' Frente A ',
      atividade_principal: 'Montagem',
      atividades_planejadas: 'Planejamento',
      riscos_operacionais: 'Risco 1',
      controles_planejados: 'Controle 1',
      epi_epc_aplicaveis: '',
      observacoes: ' Observação final ',
      company_id: 'company-1',
      site_id: 'site-1',
      responsavel_id: 'user-1',
      participants: ['user-1', 'user-1', 'user-2', ''],
    });

    expect(api.post).toHaveBeenCalledWith(
      '/dids',
      {
        titulo: 'DID de turno',
        descricao: undefined,
        data: '2026-04-15',
        turno: undefined,
        frente_trabalho: 'Frente A',
        atividade_principal: 'Montagem',
        atividades_planejadas: 'Planejamento',
        riscos_operacionais: 'Risco 1',
        controles_planejados: 'Controle 1',
        epi_epc_aplicaveis: undefined,
        observacoes: 'Observação final',
        site_id: 'site-1',
        responsavel_id: 'user-1',
        participants: ['user-1', 'user-2'],
      },
      { headers: { 'x-company-id': 'company-1' } },
    );
  });

  it('remove company_id do body e propaga tenant no header ao atualizar', async () => {
    (api.patch as jest.Mock).mockResolvedValue({ data: { id: 'did-1' } });

    await didsService.update('did-1', {
      titulo: 'DID revisado',
      company_id: 'company-2',
      site_id: 'site-2',
      responsavel_id: 'user-3',
      participants: ['user-3'],
    });

    expect(api.patch).toHaveBeenCalledWith(
      '/dids/did-1',
      expect.not.objectContaining({ company_id: expect.anything() }),
      { headers: { 'x-company-id': 'company-2' } },
    );
  });
});
