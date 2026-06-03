import { ServiceUnavailableException } from '@nestjs/common';
import { DocumentBundleService } from './document-bundle.service';
import type { DocumentStorageService } from './document-storage.service';

describe('DocumentBundleService', () => {
  it('propaga indisponibilidade de storage quando nenhum pdf pode ser baixado', async () => {
    const service = new DocumentBundleService({
      downloadFileBuffer: jest.fn().mockRejectedValue(
        new ServiceUnavailableException({
          error: 'DOCUMENT_STORAGE_UNAVAILABLE',
          message: 'Storage indisponível',
        }),
      ),
    } as unknown as DocumentStorageService);

    await expect(
      service.buildWeeklyPdfBundle('APR', { year: 2026, week: 12 }, [
        {
          fileKey: 'documents/company/apr/final.pdf',
          title: 'APR final',
        },
      ]),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
