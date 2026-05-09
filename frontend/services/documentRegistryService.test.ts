import api from '@/lib/api';
import { documentRegistryService } from '@/services/documentRegistryService';

jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

describe('documentRegistryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lista registry documental sem exigir company_id no client', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: [] });

    await documentRegistryService.list({
      year: 2026,
      week: 18,
      modules: ['dds', 'apr'],
    });

    expect(api.get).toHaveBeenCalledWith('/document-registry', {
      params: {
        company_id: undefined,
        year: 2026,
        week: 18,
        modules: 'dds,apr',
      },
    });
  });

  it('busca URL restrita para imprimir ou baixar PDF arquivado individual', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      data: {
        entityId: 'dds-1',
        hasFinalPdf: true,
        availability: 'ready',
        message: null,
        fileKey: 'documents/company-1/dds/sites/site-1/dds-1/final.pdf',
        folderPath: 'documents/company-1/dds/sites/site-1/dds-1',
        originalName: 'dds-final.pdf',
        url: '/storage/download/token',
      },
    });

    await expect(
      documentRegistryService.getPdfAccess('registry-1'),
    ).resolves.toMatchObject({
      availability: 'ready',
      url: '/storage/download/token',
    });

    expect(api.get).toHaveBeenCalledWith('/document-registry/registry-1/pdf');
  });
});
