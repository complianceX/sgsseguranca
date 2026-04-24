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
    window.localStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('busca o PDF final governado da inspeção na rota oficial', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      data: {
        entityId: 'inspection-1',
        hasFinalPdf: true,
        availability: 'ready',
        fileKey: 'documents/company-1/inspection.pdf',
        folderPath: 'inspections/company-1/2026/week-11',
        originalName: 'inspection-final.pdf',
        url: 'https://example.com/inspection.pdf',
        message: null,
      },
    });

    await expect(inspectionsService.getPdfAccess('inspection-1')).resolves.toEqual(
      expect.objectContaining({
        hasFinalPdf: true,
        availability: 'ready',
        url: 'https://example.com/inspection.pdf',
      }),
    );

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

  it('não persiste cache local sensível ao buscar inspeção', async () => {
    const inspection = {
      id: 'inspection-1',
      company_id: 'company-1',
      site_id: 'site-1',
      setor_area: 'Caldeiraria',
      tipo_inspecao: 'Rotina',
      data_inspecao: '2026-03-18',
      horario: '08:00',
      responsavel_id: 'user-1',
      created_at: '2026-03-18T10:00:00.000Z',
      updated_at: '2026-03-18T10:00:00.000Z',
    };
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');

    (api.get as jest.Mock).mockResolvedValue({ data: inspection });

    await expect(inspectionsService.findOne('inspection-1')).resolves.toEqual(
      inspection,
    );
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it('não grava evidências inline no storage do navegador ao buscar inspeção', async () => {
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');
    const inspection = {
      id: 'inspection-1',
      company_id: 'company-1',
      site_id: 'site-1',
      setor_area: 'Caldeiraria',
      tipo_inspecao: 'Rotina',
      data_inspecao: '2026-03-18',
      horario: '08:00',
      responsavel_id: 'user-1',
      evidencias: [
        {
          descricao: 'Foto do achado',
          url: 'data:image/jpeg;base64,AAAA',
          original_name: 'achado.jpg',
        },
        {
          descricao: 'Link governado',
          url: 'https://storage.example/evidencia.jpg',
          original_name: 'evidencia.jpg',
        },
      ],
      created_at: '2026-03-18T10:00:00.000Z',
      updated_at: '2026-03-18T10:00:00.000Z',
    };

    (api.get as jest.Mock).mockResolvedValue({ data: inspection });

    await inspectionsService.findOne('inspection-1');

    expect(setItemSpy).not.toHaveBeenCalled();
  });
});
