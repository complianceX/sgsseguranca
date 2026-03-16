import { Injectable } from '@nestjs/common';
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
    if (this.shouldUseManagedStorage()) {
      const buffer = await this.toBuffer(file);
      await this.storageService.uploadFile(key, buffer, contentType);
      return;
    }

    await this.s3Service.uploadFile(key, file, contentType, metadata);
  }

  async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
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
    if (this.shouldUseManagedStorage()) {
      return this.storageService.downloadFileBuffer(key);
    }

    return this.s3Service.downloadFile(key);
  }

  async deleteFile(key: string): Promise<void> {
    if (this.shouldUseManagedStorage()) {
      await this.storageService.deleteFile(key);
      return;
    }

    await this.s3Service.deleteFile(key);
  }

  private shouldUseManagedStorage(): boolean {
    return Boolean(this.configService.get<string>('AWS_BUCKET_NAME'));
  }

  private async toBuffer(file: Buffer | Readable): Promise<Buffer> {
    if (Buffer.isBuffer(file)) {
      return file;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of file) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
}
