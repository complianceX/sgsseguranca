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

  it('salva checklist preenchido a partir do template pela rota dedicada', async () => {
    (api.post as jest.Mock).mockResolvedValue({
      data: { id: 'checklist-1' },
    });

    await checklistsService.fillFromTemplate('template-1', {
      titulo: 'Checklist operacional',
      site_id: 'site-1',
    });

    expect(api.post).toHaveBeenCalledWith(
      '/checklists/fill-from-template/template-1',
      expect.objectContaining({
        titulo: 'Checklist operacional',
        site_id: 'site-1',
      }),
    );
  });

  it('emite o PDF final do checklist pela rota oficial de storage', async () => {
    (api.post as jest.Mock).mockResolvedValue({
      data: { fileKey: 'documents/company-1/checklists/checklist-1.pdf' },
    });

    await checklistsService.savePdf('checklist-1');

    expect(api.post).toHaveBeenCalledWith('/checklists/checklist-1/save-pdf');
  });
});
