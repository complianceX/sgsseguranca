import api from '@/lib/api';
import { signaturesService } from '@/services/signaturesService';

jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    get: jest.fn(),
    delete: jest.fn(),
  },
}));

describe('signaturesService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('remapeia assinatura HMAC para pin no payload', async () => {
    (api.post as jest.Mock).mockResolvedValue({
      data: { id: 'sig-1' },
    });

    await signaturesService.create({
      document_id: 'doc-1',
      document_type: 'PT',
      signature_data: '1234',
      type: 'hmac',
    });

    expect(api.post).toHaveBeenCalledWith(
      '/signatures',
      expect.objectContaining({
        type: 'hmac',
        pin: '1234',
        signature_data: 'HMAC_PENDING',
      }),
      expect.objectContaining({ timeout: 45000 }),
    );
  });

  it('nunca envia company_id no payload de assinatura', async () => {
    (api.post as jest.Mock).mockResolvedValue({
      data: { id: 'sig-1' },
    });

    await signaturesService.create({
      document_id: 'doc-1',
      document_type: 'CHECKLIST',
      signature_data: 'base64',
      type: 'digital',
      company_id: 'company-from-ui',
    });

    expect(api.post).toHaveBeenCalledWith(
      '/signatures',
      expect.not.objectContaining({
        company_id: expect.anything(),
      }),
      expect.objectContaining({ timeout: 45000 }),
    );
  });

  it('busca assinaturas por documento usando query params seguros', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      data: [],
    });

    await signaturesService.findByDocument('doc/1', 'APR FINAL');

    expect(api.get).toHaveBeenCalledWith('/signatures', {
      params: {
        document_id: 'doc/1',
        document_type: 'APR FINAL',
      },
    });
  });

  it('remove assinaturas do documento usando query params seguros', async () => {
    (api.delete as jest.Mock).mockResolvedValue({});

    await signaturesService.deleteByDocument('doc/1', 'PT FINAL');

    expect(api.delete).toHaveBeenCalledWith(
      '/signatures/document/doc%2F1',
      {
        params: {
          document_type: 'PT FINAL',
        },
      },
    );
  });
});
