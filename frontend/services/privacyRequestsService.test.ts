import api from '@/lib/api';
import { privacyRequestsService } from './privacyRequestsService';

jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
}));

describe('privacyRequestsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('cria protocolo LGPD saneando descricao vazia', async () => {
    (api.post as jest.Mock).mockResolvedValue({
      data: { id: 'req-1', type: 'access', status: 'open' },
    });

    const result = await privacyRequestsService.create({
      type: 'access',
      description: '   ',
    });

    expect(api.post).toHaveBeenCalledWith('/privacy-requests', {
      type: 'access',
      description: undefined,
    });
    expect(result.id).toBe('req-1');
  });

  it('lista protocolos do titular autenticado', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      data: [{ id: 'req-1', status: 'open' }],
    });

    const result = await privacyRequestsService.listMine();

    expect(api.get).toHaveBeenCalledWith('/privacy-requests/me');
    expect(result).toHaveLength(1);
  });

  it('atualiza status saneando resumo vazio', async () => {
    (api.patch as jest.Mock).mockResolvedValue({
      data: { id: 'req-1', status: 'in_review' },
    });

    const result = await privacyRequestsService.updateStatus('req-1', {
      status: 'in_review',
      response_summary: '   ',
    });

    expect(api.patch).toHaveBeenCalledWith('/privacy-requests/req-1', {
      status: 'in_review',
      response_summary: undefined,
    });
    expect(result.status).toBe('in_review');
  });

  it('lista eventos de um protocolo', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      data: [{ id: 'event-1', event_type: 'created' }],
    });

    const result = await privacyRequestsService.listEvents('req-1');

    expect(api.get).toHaveBeenCalledWith('/privacy-requests/req-1/events');
    expect(result[0].id).toBe('event-1');
  });
});
