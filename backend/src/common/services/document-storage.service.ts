import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';
import { S3Service } from '../storage/s3.service';
import { StorageService } from './storage.service';

@Injectable()
export class DocumentStorageService {
  constructor(
    private readonly configService: ConfigService,
    private readonly storageService: StorageService,
    private readonly s3Service: S3Service,
  ) {}

  generateDocumentKey(
    companyId: string,
    documentType: string,
    documentId: string,
    filename: string,
  ): string {
    const timestamp = Date.now();
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    return `documents/${companyId}/${documentType}/${documentId}/${timestamp}-${sanitizedFilename}`;
  }

  async uploadFile(
    key: string,
    file: Buffer | Readable,
    contentType: string,
    metadata?: Record<string, string>,
  ): Promise<void> {
    this.ensureStorageConfigured('upload');

    if (this.shouldUseManagedStorage()) {
      const buffer = await this.toBuffer(file);
      await this.storageService.uploadFile(key, buffer, contentType);
      return;
    }

    await this.s3Service.uploadFile(key, file, contentType, metadata);
  }

  async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
    this.ensureStorageConfigured('presign');

    if (this.shouldUseManagedStorage()) {
      return this.storageService.getPresignedDownloadUrl(key, expiresIn);
    }

    return this.s3Service.getSignedUrl(key, expiresIn);
  }

  async getPresignedDownloadUrl(
    key: string,
    expiresIn = 3600,
  ): Promise<string> {
    return this.getSignedUrl(key, expiresIn);
  }

  async downloadFileBuffer(key: string): Promise<Buffer> {
    this.ensureStorageConfigured('download');

    if (this.shouldUseManagedStorage()) {
      return this.storageService.downloadFileBuffer(key);
    }

    return this.s3Service.downloadFile(key);
  }

  async deleteFile(key: string): Promise<void> {
    this.ensureStorageConfigured('delete');

    if (this.shouldUseManagedStorage()) {
      await this.storageService.deleteFile(key);
      return;
    }

    await this.s3Service.deleteFile(key);
  }

  private shouldUseManagedStorage(): boolean {
    return Boolean(this.configService.get<string>('AWS_BUCKET_NAME'));
  }

  private shouldUseLegacyS3(): boolean {
    return Boolean(this.configService.get<string>('AWS_S3_BUCKET'));
  }

  private ensureStorageConfigured(
    action: 'upload' | 'presign' | 'download' | 'delete',
  ): void {
    if (this.shouldUseManagedStorage() || this.shouldUseLegacyS3()) {
      return;
    }

    throw new ServiceUnavailableException({
      error: 'DOCUMENT_STORAGE_UNAVAILABLE',
      message:
        'Armazenamento documental indisponível. Configure o storage antes de anexar, emitir ou acessar artefatos governados.',
      details: {
        action,
        storageConfigured: false,
      },
    });
  }

  private async toBuffer(file: Buffer | Readable): Promise<Buffer> {
    if (Buffer.isBuffer(file)) {
      return file;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of file) {
      chunks.push(
        Buffer.isBuffer(chunk)
          ? chunk
          : typeof chunk === 'string'
            ? Buffer.from(chunk)
            : Buffer.from(chunk as Uint8Array),
      );
    }
    return Buffer.concat(chunks);
  }
}
