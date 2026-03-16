import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentStorageService } from './document-storage.service';
import type { S3Service } from '../storage/s3.service';
import type { StorageService } from './storage.service';

describe('DocumentStorageService', () => {
  it('falha de forma explícita quando nenhum storage documental está configurado', async () => {
    const service = new DocumentStorageService(
      {
        get: jest.fn((_key: string, defaultValue?: string) => defaultValue),
      } as unknown as ConfigService,
      {} as StorageService,
      {} as S3Service,
    );

    await expect(
      service.uploadFile(
        'documents/company/doc.pdf',
        Buffer.from('%PDF-test'),
        'application/pdf',
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
