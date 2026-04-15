import api from '@/lib/api';
import { correctiveActionsService } from '@/services/correctiveActionsService';

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

const mockPaginatedResponse = {
  data: [],
  page: 1,
  limit: 20,
  total: 0,
  lastPage: 1,
};

const mockAction = {
  id: 'ca-1',
  title: 'Ação corretiva teste',
  description: 'Descrição da ação',
  source_type: 'manual' as const,
  company_id: 'company-1',
  due_date: '2026-05-01',
  status: 'open' as const,
  priority: 'medium' as const,
  created_at: '2026-04-01T00:00:00.000Z',
  updated_at: '2026-04-01T00:00:00.000Z',
};

describe('correctiveActionsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findPaginated', () => {
    it('usa página 1 e limite 20 como padrão quando nenhum parâmetro é fornecido', async () => {
      (api.get as jest.Mock).mockResolvedValue({ data: mockPaginatedResponse });

      await correctiveActionsService.findPaginated();

      expect(api.get).toHaveBeenCalledWith('/corrective-actions', {
        params: { page: 1, limit: 20 },
      });
    });

    it('envia filtro de status quando fornecido', async () => {
      (api.get as jest.Mock).mockResolvedValue({ data: mockPaginatedResponse });

      await correctiveActionsService.findPaginated({ status: 'open' });

      expect(api.get).toHaveBeenCalledWith('/corrective-actions', {
        params: { page: 1, limit: 20, status: 'open' },
      });
    });

    it('envia filtro de source_type quando fornecido', async () => {
      (api.get as jest.Mock).mockResolvedValue({ data: mockPaginatedResponse });

      await correctiveActionsService.findPaginated({ source_type: 'audit' });

      expect(api.get).toHaveBeenCalledWith('/corrective-actions', {
        params: { page: 1, limit: 20, source_type: 'audit' },
      });
    });

    it('envia filtro de due quando fornecido', async () => {
      (api.get as jest.Mock).mockResolvedValue({ data: mockPaginatedResponse });

      await correctiveActionsService.findPaginated({ due: 'overdue' });

      expect(api.get).toHaveBeenCalledWith('/corrective-actions', {
        params: { page: 1, limit: 20, due: 'overdue' },
      });
    });

    it('envia todos os filtros combinados com paginação personalizada', async () => {
      (api.get as jest.Mock).mockResolvedValue({ data: mockPaginatedResponse });

      await correctiveActionsService.findPaginated({
        page: 3,
        limit: 10,
        status: 'in_progress',
        source_type: 'nonconformity',
        due: 'soon',
      });

      expect(api.get).toHaveBeenCalledWith('/corrective-actions', {
        params: {
          page: 3,
          limit: 10,
          status: 'in_progress',
          source_type: 'nonconformity',
          due: 'soon',
        },
      });
    });

    it('não inclui status no params quando não fornecido', async () => {
      (api.get as jest.Mock).mockResolvedValue({ data: mockPaginatedResponse });

      await correctiveActionsService.findPaginated({ page: 2 });

      const call = (api.get as jest.Mock).mock.calls[0];
      expect(call[1].params).not.toHaveProperty('status');
    });
  });

  describe('findAll', () => {
    it('lista todas as ações corretivas sem paginação', async () => {
      const actions = [mockAction];
      (api.get as jest.Mock).mockResolvedValue({ data: actions });

      const result = await correctiveActionsService.findAll();

      expect(api.get).toHaveBeenCalledWith('/corrective-actions', {
        params: undefined,
      });
      expect(result).toEqual(actions);
    });

    it('passa filtros opcionais ao listar todas', async () => {
      (api.get as jest.Mock).mockResolvedValue({ data: [] });

      await correctiveActionsService.findAll({
        status: 'done',
        source_type: 'manual',
      });

      expect(api.get).toHaveBeenCalledWith('/corrective-actions', {
        params: { status: 'done', source_type: 'manual' },
      });
    });
  });

  describe('findSummary', () => {
    it('retorna resumo consolidado das ações corretivas', async () => {
      const summary = { total: 50, open: 10, inProgress: 15, done: 20, overdue: 5 };
      (api.get as jest.Mock).mockResolvedValue({ data: summary });

      const result = await correctiveActionsService.findSummary();

      expect(api.get).toHaveBeenCalledWith('/corrective-actions/summary');
      expect(result).toEqual(summary);
    });
  });

  describe('getSlaOverview', () => {
    it('retorna visão geral do SLA das ações corretivas', async () => {
      const sla = {
        overdue: 3,
        dueSoon: 7,
        criticalOpen: 2,
        highOpen: 5,
        avgResolutionDays: '12.5',
      };
      (api.get as jest.Mock).mockResolvedValue({ data: sla });

      const result = await correctiveActionsService.getSlaOverview();

      expect(api.get).toHaveBeenCalledWith('/corrective-actions/sla/overview');
      expect(result.avgResolutionDays).toBe('12.5');
    });
  });

  describe('getSlaBySite', () => {
    it('retorna dados de SLA agrupados por site', async () => {
      const slaBySite = [
        { site: 'Site A', total: 10, overdue: 2, criticalOpen: 1 },
        { site: 'Site B', total: 5, overdue: 0, criticalOpen: 0 },
      ];
      (api.get as jest.Mock).mockResolvedValue({ data: slaBySite });

      const result = await correctiveActionsService.getSlaBySite();

      expect(api.get).toHaveBeenCalledWith('/corrective-actions/sla/by-site');
      expect(result).toHaveLength(2);
      expect(result[0].site).toBe('Site A');
    });
  });

  describe('create', () => {
    it('cria uma nova ação corretiva com os dados fornecidos', async () => {
      (api.post as jest.Mock).mockResolvedValue({ data: mockAction });

      const payload = {
        title: 'Ação corretiva teste',
        description: 'Descrição da ação',
        due_date: '2026-05-01',
        priority: 'medium' as const,
      };

      const result = await correctiveActionsService.create(payload);

      expect(api.post).toHaveBeenCalledWith('/corrective-actions', payload);
      expect(result.id).toBe('ca-1');
    });
  });

  describe('createFromNonConformity', () => {
    it('cria ação corretiva a partir de uma não conformidade', async () => {
      (api.post as jest.Mock).mockResolvedValue({ data: { ...mockAction, source_type: 'nonconformity' } });

      const result = await correctiveActionsService.createFromNonConformity('nc-42');

      expect(api.post).toHaveBeenCalledWith('/corrective-actions/from/nonconformity/nc-42');
      expect(result.source_type).toBe('nonconformity');
    });
  });

  describe('createFromAudit', () => {
    it('cria ação corretiva a partir de uma auditoria', async () => {
      (api.post as jest.Mock).mockResolvedValue({ data: { ...mockAction, source_type: 'audit' } });

      const result = await correctiveActionsService.createFromAudit('audit-99');

      expect(api.post).toHaveBeenCalledWith('/corrective-actions/from/audit/audit-99');
      expect(result.source_type).toBe('audit');
    });
  });

  describe('update', () => {
    it('atualiza parcialmente uma ação corretiva', async () => {
      const updated = { ...mockAction, title: 'Título atualizado' };
      (api.patch as jest.Mock).mockResolvedValue({ data: updated });

      const result = await correctiveActionsService.update('ca-1', { title: 'Título atualizado' });

      expect(api.patch).toHaveBeenCalledWith('/corrective-actions/ca-1', {
        title: 'Título atualizado',
      });
      expect(result.title).toBe('Título atualizado');
    });
  });

  describe('updateStatus', () => {
    it('atualiza o status da ação corretiva com notas de evidência', async () => {
      const updated = { ...mockAction, status: 'done' as const };
      (api.patch as jest.Mock).mockResolvedValue({ data: updated });

      const result = await correctiveActionsService.updateStatus('ca-1', 'done', 'Evidência registrada');

      expect(api.patch).toHaveBeenCalledWith('/corrective-actions/ca-1/status', {
        status: 'done',
        evidence_notes: 'Evidência registrada',
      });
      expect(result.status).toBe('done');
    });

    it('atualiza o status sem notas de evidência quando não fornecidas', async () => {
      (api.patch as jest.Mock).mockResolvedValue({ data: mockAction });

      await correctiveActionsService.updateStatus('ca-1', 'in_progress');

      expect(api.patch).toHaveBeenCalledWith('/corrective-actions/ca-1/status', {
        status: 'in_progress',
        evidence_notes: undefined,
      });
    });
  });

  describe('remove', () => {
    it('remove uma ação corretiva pelo id', async () => {
      (api.delete as jest.Mock).mockResolvedValue({});

      await correctiveActionsService.remove('ca-1');

      expect(api.delete).toHaveBeenCalledWith('/corrective-actions/ca-1');
    });
  });

  describe('propagação de erros', () => {
    it('propaga erro quando o backend falha ao listar ações paginadas', async () => {
      const error = { response: { status: 500 } };
      (api.get as jest.Mock).mockRejectedValue(error);

      await expect(correctiveActionsService.findPaginated()).rejects.toBe(error);
    });

    it('propaga erro quando o backend falha ao criar ação corretiva', async () => {
      const error = { response: { status: 422 } };
      (api.post as jest.Mock).mockRejectedValue(error);

      await expect(
        correctiveActionsService.create({ title: 'X', description: 'Y' }),
      ).rejects.toBe(error);
    });

    it('propaga erro 404 quando ação não encontrada ao atualizar status', async () => {
      const error = { response: { status: 404 } };
      (api.patch as jest.Mock).mockRejectedValue(error);

      await expect(
        correctiveActionsService.updateStatus('nao-existe', 'done'),
      ).rejects.toBe(error);
    });
  });
});
