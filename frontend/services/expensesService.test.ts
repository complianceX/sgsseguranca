import api from '@/lib/api';
import {
  expensesService,
  EXPENSE_CATEGORY_LABEL,
  EXPENSE_STATUS_LABEL,
} from '@/services/expensesService';

jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

describe('expensesService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('expõe labels estáveis para categorias e status', () => {
    expect(EXPENSE_CATEGORY_LABEL.transporte).toBe('Transporte');
    expect(EXPENSE_CATEGORY_LABEL.alimentacao).toBe('Alimentação');
    expect(EXPENSE_STATUS_LABEL.aberta).toBe('Aberta');
    expect(EXPENSE_STATUS_LABEL.fechada).toBe('Fechada');
  });

  it('findPaginated envia filtros ao backend', async () => {
    const response = { data: [], total: 0, page: 1, lastPage: 1 };
    (api.get as jest.Mock).mockResolvedValue({ data: response });

    const result = await expensesService.findPaginated({
      page: 2,
      limit: 10,
      site_id: 'site-1',
      status: 'aberta',
      period_start: '2026-05-01',
      period_end: '2026-05-31',
    });

    expect(api.get).toHaveBeenCalledWith('/expenses/reports', {
      params: {
        page: 2,
        limit: 10,
        site_id: 'site-1',
        status: 'aberta',
        period_start: '2026-05-01',
        period_end: '2026-05-31',
      },
    });
    expect(result).toBe(response);
  });

  it('addItem envia multipart com comprovante obrigatório', async () => {
    const file = new File(['pdf'], 'cupom.pdf', { type: 'application/pdf' });
    (api.post as jest.Mock).mockResolvedValue({ data: { id: 'report-1' } });

    await expensesService.addItem('report-1', {
      category: 'alimentacao',
      amount: 45.9,
      expense_date: '2026-05-08',
      description: 'Almoço em campo',
      vendor: 'Restaurante',
      location: 'Obra X',
      file,
    });

    expect(api.post).toHaveBeenCalledWith(
      '/expenses/reports/report-1/items',
      expect.any(FormData),
    );
    const formData = (api.post as jest.Mock).mock.calls[0][1] as FormData;
    expect(formData.get('category')).toBe('alimentacao');
    expect(formData.get('amount')).toBe('45.9');
    expect(formData.get('file')).toBe(file);
  });

  it('close chama endpoint de fechamento', async () => {
    (api.post as jest.Mock).mockResolvedValue({
      data: { id: 'report-1', status: 'fechada' },
    });

    const result = await expensesService.close('report-1');

    expect(api.post).toHaveBeenCalledWith('/expenses/reports/report-1/close');
    expect(result.status).toBe('fechada');
  });
});
