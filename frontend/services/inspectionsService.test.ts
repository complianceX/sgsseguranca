import api from '@/lib/api';
import { inspectionsService } from '@/services/inspectionsService';

jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

describe('inspectionsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('busca o PDF final governado da inspeção na rota oficial', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      data: { url: 'https://example.com/inspection.pdf' },
    });

    await inspectionsService.getPdfAccess('inspection-1');

    expect(api.get).toHaveBeenCalledWith('/inspections/inspection-1/pdf');
  });

  it('envia o PDF final da inspeção para a rota oficial de storage', async () => {
    (api.post as jest.Mock).mockResolvedValue({
      data: { fileKey: 'documents/company-1/inspection.pdf' },
    });

    const file = new File(['pdf'], 'inspection-final.pdf', {
      type: 'application/pdf',
    });

    await inspectionsService.attachFile('inspection-1', file);

    expect(api.post).toHaveBeenCalledWith(
      '/inspections/inspection-1/file',
      expect.any(FormData),
      expect.objectContaining({
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
    );
  });

  it('lista os arquivos finais de inspeção pela rota semanal oficial', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      data: [],
    });

    await inspectionsService.listStoredFiles({
      year: 2026,
      week: 11,
    });

    expect(api.get).toHaveBeenCalledWith('/inspections/files/list', {
      params: { year: 2026, week: 11 },
    });
  });
});
