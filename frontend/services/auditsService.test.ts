import api from '@/lib/api';
import { auditsService } from '@/services/auditsService';

jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

describe('auditsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('busca o contrato explicito de disponibilidade do PDF final da auditoria', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      data: {
        entityId: 'audit-1',
        hasFinalPdf: false,
        availability: 'not_emitted',
        message: 'PDF final ainda não emitido para esta auditoria.',
        fileKey: null,
        folderPath: null,
        originalName: null,
        url: null,
      },
    });

    await expect(auditsService.getPdfAccess('audit-1')).resolves.toEqual({
      entityId: 'audit-1',
      hasFinalPdf: false,
      availability: 'not_emitted',
      message: 'PDF final ainda não emitido para esta auditoria.',
      fileKey: null,
      folderPath: null,
      originalName: null,
      url: null,
    });

    expect(api.get).toHaveBeenCalledWith('/audits/audit-1/pdf');
  });
});
