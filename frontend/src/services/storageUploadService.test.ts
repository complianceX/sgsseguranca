import api from '@/lib/api';
import { storageUploadService } from '@/services/storageUploadService';

jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
  },
}));

describe('storageUploadService', () => {
  const subtleDigest = jest.fn();
  const originalFetch = global.fetch;
  const originalCrypto = global.crypto;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
    }) as unknown as typeof fetch;
    Object.defineProperty(global, 'crypto', {
      configurable: true,
      value: {
        subtle: {
          digest: subtleDigest,
        },
      },
    });
  });

  afterAll(() => {
    global.fetch = originalFetch;
    Object.defineProperty(global, 'crypto', {
      configurable: true,
      value: originalCrypto,
    });
  });

  it('executa o fluxo completo presigned-url -> upload -> complete-upload', async () => {
    (api.post as jest.Mock)
      .mockResolvedValueOnce({
        data: {
          uploadUrl: 'https://bucket.example.com/upload',
          fileKey: 'quarantine/company/file.pdf',
          expiresIn: 600,
        },
      })
      .mockResolvedValueOnce({
        data: {
          fileKey: 'documents/company/file.pdf',
          sizeBytes: 10,
          sha256Verified: true,
        },
      });
    subtleDigest.mockResolvedValue(
      Uint8Array.from([0xde, 0xad, 0xbe, 0xef]).buffer,
    );

    const file = new File(['conteudo-pdf'], 'teste.pdf', {
      type: 'application/pdf',
    });

    await expect(storageUploadService.uploadPdf(file)).resolves.toEqual({
      fileKey: 'documents/company/file.pdf',
      sizeBytes: 10,
      sha256Verified: true,
    });

    expect(api.post).toHaveBeenNthCalledWith(1, '/storage/presigned-url', {
      filename: 'teste.pdf',
      contentType: 'application/pdf',
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://bucket.example.com/upload',
      expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'application/pdf' },
      }),
    );
    expect(api.post).toHaveBeenNthCalledWith(2, '/storage/complete-upload', {
      fileKey: 'quarantine/company/file.pdf',
      originalFilename: 'teste.pdf',
      sha256: 'deadbeef',
    });
  });

  it('propaga erro quando o PUT na URL presignada falha', async () => {
    (api.post as jest.Mock).mockResolvedValueOnce({
      data: {
        uploadUrl: 'https://bucket.example.com/upload',
        fileKey: 'quarantine/company/file.pdf',
        expiresIn: 600,
      },
    });
    subtleDigest.mockResolvedValue(
      Uint8Array.from([0xde, 0xad, 0xbe, 0xef]).buffer,
    );
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
    }) as unknown as typeof fetch;

    const file = new File(['conteudo-pdf'], 'teste.pdf', {
      type: 'application/pdf',
    });

    await expect(storageUploadService.uploadPdf(file)).rejects.toThrow(
      'Falha ao enviar arquivo para a URL presignada (403).',
    );
  });
});
