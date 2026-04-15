import api from '@/lib/api';
import { catsService } from '@/services/catsService';

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
  PaginatedResponse: {},
}));

jest.mock('@/lib/pdf/catGenerator', () => ({
  generateCatPdf: jest.fn(),
}));

import { fetchAllPages } from '@/services/pagination';

const mockCat = {
  id: 'cat-1',
  numero: 'CAT-001',
  company_id: 'company-1',
  data_ocorrencia: '2026-04-10',
  tipo: 'tipico' as const,
  gravidade: 'leve' as const,
  descricao: 'Acidente leve na obra',
  status: 'aberta' as const,
  created_at: '2026-04-10T08:00:00.000Z',
  updated_at: '2026-04-10T08:00:00.000Z',
};

const mockPaginatedResponse = {
  data: [mockCat],
  page: 1,
  limit: 20,
  total: 1,
  lastPage: 1,
};

describe('catsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findPaginated', () => {
    it('usa página 1 e limite 20 como padrão quando nenhum parâmetro é fornecido', async () => {
      (api.get as jest.Mock).mockResolvedValue({ data: mockPaginatedResponse });

      await catsService.findPaginated();

      expect(api.get).toHaveBeenCalledWith('/cats', {
        params: { page: 1, limit: 20 },
      });
    });

    it('envia filtro de status quando fornecido', async () => {
      (api.get as jest.Mock).mockResolvedValue({ data: mockPaginatedResponse });

      await catsService.findPaginated({ status: 'investigacao' });

      expect(api.get).toHaveBeenCalledWith('/cats', {
        params: { page: 1, limit: 20, status: 'investigacao' },
      });
    });

    it('envia filtro de worker_id quando fornecido', async () => {
      (api.get as jest.Mock).mockResolvedValue({ data: mockPaginatedResponse });

      await catsService.findPaginated({ worker_id: 'worker-5' });

      expect(api.get).toHaveBeenCalledWith('/cats', {
        params: { page: 1, limit: 20, worker_id: 'worker-5' },
      });
    });

    it('envia filtro de site_id quando fornecido', async () => {
      (api.get as jest.Mock).mockResolvedValue({ data: mockPaginatedResponse });

      await catsService.findPaginated({ site_id: 'site-3' });

      expect(api.get).toHaveBeenCalledWith('/cats', {
        params: { page: 1, limit: 20, site_id: 'site-3' },
      });
    });

    it('envia todos os filtros combinados com paginação personalizada', async () => {
      (api.get as jest.Mock).mockResolvedValue({ data: mockPaginatedResponse });

      await catsService.findPaginated({
        page: 2,
        limit: 50,
        status: 'fechada',
        worker_id: 'worker-1',
        site_id: 'site-2',
      });

      expect(api.get).toHaveBeenCalledWith('/cats', {
        params: {
          page: 2,
          limit: 50,
          status: 'fechada',
          worker_id: 'worker-1',
          site_id: 'site-2',
        },
      });
    });

    it('não inclui worker_id nos params quando não fornecido', async () => {
      (api.get as jest.Mock).mockResolvedValue({ data: mockPaginatedResponse });

      await catsService.findPaginated({ status: 'aberta' });

      const call = (api.get as jest.Mock).mock.calls[0];
      expect(call[1].params).not.toHaveProperty('worker_id');
    });
  });

  describe('findAll', () => {
    it('usa fetchAllPages com limite de 100 e máximo de 50 páginas', async () => {
      (fetchAllPages as jest.Mock).mockResolvedValue([mockCat]);

      const result = await catsService.findAll();

      expect(fetchAllPages).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 100, maxPages: 50 }),
      );
      expect(result).toEqual([mockCat]);
    });

    it('passa filtros para fetchAllPages quando fornecidos', async () => {
      (fetchAllPages as jest.Mock).mockResolvedValue([]);

      await catsService.findAll({ status: 'fechada', site_id: 'site-1' });

      expect(fetchAllPages).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 100, maxPages: 50 }),
      );
    });
  });

  describe('findOne', () => {
    it('retorna o registro CAT pelo id', async () => {
      (api.get as jest.Mock).mockResolvedValue({ data: mockCat });

      const result = await catsService.findOne('cat-1');

      expect(api.get).toHaveBeenCalledWith('/cats/cat-1');
      expect(result.id).toBe('cat-1');
    });

    it('propaga erro 404 quando CAT não encontrado', async () => {
      const error = { response: { status: 404 } };
      (api.get as jest.Mock).mockRejectedValue(error);

      await expect(catsService.findOne('nao-existe')).rejects.toBe(error);
    });
  });

  describe('getSummary', () => {
    it('retorna resumo consolidado dos CATs', async () => {
      const summary = {
        total: 20,
        aberta: 5,
        investigacao: 8,
        fechada: 7,
        bySeverity: { leve: 10, moderada: 5, grave: 4, fatal: 1 },
      };
      (api.get as jest.Mock).mockResolvedValue({ data: summary });

      const result = await catsService.getSummary();

      expect(api.get).toHaveBeenCalledWith('/cats/summary');
      expect(result.total).toBe(20);
    });
  });

  describe('create', () => {
    it('cria um novo CAT com os dados fornecidos', async () => {
      (api.post as jest.Mock).mockResolvedValue({ data: mockCat });

      const payload = {
        numero: 'CAT-001',
        data_ocorrencia: '2026-04-10',
        tipo: 'tipico' as const,
        gravidade: 'leve' as const,
        descricao: 'Acidente leve',
      };

      const result = await catsService.create(payload);

      expect(api.post).toHaveBeenCalledWith('/cats', payload);
      expect(result.numero).toBe('CAT-001');
    });
  });

  describe('update', () => {
    it('atualiza parcialmente um CAT pelo id', async () => {
      const updated = { ...mockCat, descricao: 'Descrição atualizada' };
      (api.patch as jest.Mock).mockResolvedValue({ data: updated });

      const result = await catsService.update('cat-1', { descricao: 'Descrição atualizada' });

      expect(api.patch).toHaveBeenCalledWith('/cats/cat-1', { descricao: 'Descrição atualizada' });
      expect(result.descricao).toBe('Descrição atualizada');
    });
  });

  describe('startInvestigation', () => {
    it('inicia investigação do CAT com detalhes obrigatórios', async () => {
      const investigando = { ...mockCat, status: 'investigacao' as const };
      (api.post as jest.Mock).mockResolvedValue({ data: investigando });

      const result = await catsService.startInvestigation('cat-1', {
        investigacao_detalhes: 'Investigação detalhada do acidente',
        causa_raiz: 'Falta de EPI',
        acao_imediata: 'Afastamento do colaborador',
      });

      expect(api.post).toHaveBeenCalledWith('/cats/cat-1/investigation', {
        investigacao_detalhes: 'Investigação detalhada do acidente',
        causa_raiz: 'Falta de EPI',
        acao_imediata: 'Afastamento do colaborador',
      });
      expect(result.status).toBe('investigacao');
    });
  });

  describe('close', () => {
    it('encerra um CAT com plano de ação obrigatório', async () => {
      const fechado = { ...mockCat, status: 'fechada' as const };
      (api.post as jest.Mock).mockResolvedValue({ data: fechado });

      const result = await catsService.close('cat-1', {
        plano_acao_fechamento: 'Treinamento obrigatório realizado',
        licoes_aprendidas: 'Uso obrigatório de capacete',
      });

      expect(api.post).toHaveBeenCalledWith('/cats/cat-1/close', {
        plano_acao_fechamento: 'Treinamento obrigatório realizado',
        licoes_aprendidas: 'Uso obrigatório de capacete',
      });
      expect(result.status).toBe('fechada');
    });
  });

  describe('uploadAttachment', () => {
    it('envia anexo em multipart com categoria padrão geral', async () => {
      const attachment = {
        id: 'att-1',
        file_name: 'laudo.pdf',
        file_key: 'key/laudo.pdf',
        file_type: 'application/pdf',
        category: 'geral' as const,
        uploaded_at: '2026-04-10T10:00:00.000Z',
      };
      (api.post as jest.Mock).mockResolvedValue({ data: attachment });

      const file = new File(['conteudo'], 'laudo.pdf', { type: 'application/pdf' });
      const result = await catsService.uploadAttachment('cat-1', file);

      expect(api.post).toHaveBeenCalledWith(
        '/cats/cat-1/file',
        expect.any(FormData),
        expect.objectContaining({ params: { category: 'geral' } }),
      );
      expect(result.file_name).toBe('laudo.pdf');
    });

    it('envia anexo com categoria específica quando fornecida', async () => {
      (api.post as jest.Mock).mockResolvedValue({
        data: { id: 'att-2', file_name: 'foto.jpg', file_key: 'key/foto.jpg', file_type: 'image/jpeg', category: 'investigacao', uploaded_at: '' },
      });

      const file = new File(['img'], 'foto.jpg', { type: 'image/jpeg' });
      await catsService.uploadAttachment('cat-1', file, 'investigacao');

      expect(api.post).toHaveBeenCalledWith(
        '/cats/cat-1/file',
        expect.any(FormData),
        expect.objectContaining({ params: { category: 'investigacao' } }),
      );
    });
  });

  describe('removeAttachment', () => {
    it('remove um anexo do CAT pelo id do anexo', async () => {
      (api.delete as jest.Mock).mockResolvedValue({});

      await catsService.removeAttachment('cat-1', 'att-1');

      expect(api.delete).toHaveBeenCalledWith('/cats/cat-1/attachments/att-1');
    });
  });

  describe('getAttachmentAccess', () => {
    it('retorna URL de acesso ao anexo', async () => {
      const access = {
        attachmentId: 'att-1',
        fileName: 'laudo.pdf',
        fileType: 'application/pdf',
        url: 'https://storage.example.com/laudo.pdf',
      };
      (api.get as jest.Mock).mockResolvedValue({ data: access });

      const result = await catsService.getAttachmentAccess('cat-1', 'att-1');

      expect(api.get).toHaveBeenCalledWith('/cats/cat-1/attachments/att-1/access');
      expect(result.url).toBe('https://storage.example.com/laudo.pdf');
    });
  });

  describe('getPdfAccess', () => {
    it('retorna acesso ao PDF governado do CAT', async () => {
      const pdfAccess = {
        catId: 'cat-1',
        degraded: false,
        fileHash: 'abc123',
        documentCode: 'CAT-DOC-001',
        availability: 'ready',
        url: 'https://storage.example.com/cat.pdf',
      };
      (api.get as jest.Mock).mockResolvedValue({ data: pdfAccess });

      const result = await catsService.getPdfAccess('cat-1');

      expect(api.get).toHaveBeenCalledWith('/cats/cat-1/pdf');
      expect(result.catId).toBe('cat-1');
    });
  });

  describe('attachFinalPdf', () => {
    it('envia o PDF final do CAT em multipart', async () => {
      const attachResult = {
        catId: 'cat-1',
        hasFinalPdf: true,
        availability: 'ready' as const,
        message: 'PDF registrado com sucesso',
        degraded: false,
        fileKey: 'key/cat.pdf',
        folderPath: 'cats/cat-1',
        originalName: 'cat-001.pdf',
        documentCode: 'CAT-DOC-001',
        fileHash: 'sha256-hash',
      };
      (api.post as jest.Mock).mockResolvedValue({ data: attachResult });

      const file = new File(['pdf-content'], 'cat-001.pdf', { type: 'application/pdf' });
      const result = await catsService.attachFinalPdf('cat-1', file);

      expect(api.post).toHaveBeenCalledWith(
        '/cats/cat-1/pdf/file',
        expect.any(FormData),
        expect.objectContaining({ headers: { 'Content-Type': 'multipart/form-data' } }),
      );
      expect(result.hasFinalPdf).toBe(true);
    });
  });

  describe('getStatistics', () => {
    it('retorna estatísticas consolidadas dos CATs', async () => {
      const stats = {
        total: 100,
        fatalCount: 2,
        openCount: 15,
        byTipo: { tipico: 80, trajeto: 20 },
        byGravidade: { leve: 60, moderada: 25, grave: 13, fatal: 2 },
        byMonth: [{ month: '2026-01', total: 8 }],
      };
      (api.get as jest.Mock).mockResolvedValue({ data: stats });

      const result = await catsService.getStatistics();

      expect(api.get).toHaveBeenCalledWith('/cats/statistics');
      expect(result.fatalCount).toBe(2);
    });
  });

  describe('propagação de erros', () => {
    it('propaga erro quando o backend falha ao listar CATs paginados', async () => {
      const error = { response: { status: 500 } };
      (api.get as jest.Mock).mockRejectedValue(error);

      await expect(catsService.findPaginated()).rejects.toBe(error);
    });

    it('propaga erro 422 ao criar CAT com dados inválidos', async () => {
      const error = { response: { status: 422, data: { message: 'Dados inválidos' } } };
      (api.post as jest.Mock).mockRejectedValue(error);

      await expect(catsService.create({ descricao: '' })).rejects.toBe(error);
    });
  });
});
