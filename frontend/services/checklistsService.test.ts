import api from '@/lib/api';
import { checklistsService } from '@/services/checklistsService';

jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

describe('checklistsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('busca acesso ao PDF salvo na rota oficial do checklist', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      data: { url: 'https://example.com/checklist.pdf' },
    });

    await checklistsService.getPdfAccess('checklist-1');

    expect(api.get).toHaveBeenCalledWith('/checklists/checklist-1/pdf');
  });

  it('salva checklist preenchido a partir do modelo pela rota dedicada', async () => {
    (api.post as jest.Mock).mockResolvedValue({
      data: { id: 'checklist-1' },
    });

    await checklistsService.fillFromModel('model-1', {
      titulo: 'Checklist operacional',
      site_id: 'site-1',
    });

    expect(api.post).toHaveBeenCalledWith(
      '/checklists/fill-from-model/model-1',
      expect.objectContaining({
        titulo: 'Checklist operacional',
        site_id: 'site-1',
      }),
      { headers: undefined },
    );
  });

  it('sincroniza os modelos padrão pela rota dedicada', async () => {
    (api.post as jest.Mock).mockResolvedValue({
      data: { created: 1, skipped: 14, templates: [] },
    });

    await checklistsService.bootstrapPresetModels();

    expect(api.post).toHaveBeenCalledWith('/checklists/models/bootstrap');
  });

  it('anexa o PDF final do checklist pela rota governada padronizada', async () => {
    (api.post as jest.Mock).mockResolvedValue({
      data: { fileKey: 'documents/company-1/checklists/checklist-1/checklist.pdf' },
    });

    const file = new File(['%PDF-checklist'], 'checklist.pdf', {
      type: 'application/pdf',
    });

    await checklistsService.attachFile('checklist-1', file);

    expect(api.post).toHaveBeenCalledWith(
      '/checklists/checklist-1/file',
      expect.any(FormData),
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      },
    );
  });
});
