import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentStorageService } from './document-storage.service';
import type { S3Service } from '../storage/s3.service';
import type { StorageService } from './storage.service';

describe('DocumentStorageService', () => {
  const createConfigService = (
    values: Record<string, string | undefined> = {},
  ): ConfigService =>
    ({
      get: jest.fn((key: string, defaultValue?: string) => {
        const value = values[key];
        return value === undefined ? defaultValue : value;
      }),
    }) as unknown as ConfigService;

  it('falha de forma explícita quando nenhum storage documental está configurado', async () => {
    const service = new DocumentStorageService(
      createConfigService(),
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

  it('usa o storage gerenciado quando AWS_BUCKET_NAME está configurado', async () => {
    const uploadFile = jest.fn().mockResolvedValue(undefined);
    const legacyUploadFile = jest.fn().mockResolvedValue(undefined);
    const service = new DocumentStorageService(
      createConfigService({ AWS_BUCKET_NAME: 'managed-bucket' }),
      {
        uploadFile,
      } as unknown as StorageService,
      {
        uploadFile: legacyUploadFile,
      } as unknown as S3Service,
    );

    await service.uploadFile(
      'documents/company/video.mp4',
      Buffer.from('video'),
      'video/mp4',
    );

    expect(uploadFile).toHaveBeenCalledWith(
      'documents/company/video.mp4',
      Buffer.from('video'),
      'video/mp4',
    );
    expect(legacyUploadFile).not.toHaveBeenCalled();
  });

  it('usa o caminho legado quando AWS_S3_BUCKET está configurado', async () => {
    const uploadFile = jest.fn().mockResolvedValue(undefined);
    const legacyUploadFile = jest.fn().mockResolvedValue(undefined);
    const service = new DocumentStorageService(
      createConfigService({ AWS_S3_BUCKET: 'legacy-bucket' }),
      {
        uploadFile,
      } as unknown as StorageService,
      {
        uploadFile: legacyUploadFile,
      } as unknown as S3Service,
    );

    await service.uploadFile(
      'documents/company/video.mp4',
      Buffer.from('video'),
      'video/mp4',
    );

    expect(legacyUploadFile).toHaveBeenCalledWith(
      'documents/company/video.mp4',
      Buffer.from('video'),
      'video/mp4',
      undefined,
    );
    expect(uploadFile).not.toHaveBeenCalled();
  });
});
