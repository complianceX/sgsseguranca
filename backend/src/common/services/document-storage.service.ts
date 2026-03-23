import {
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';
import { S3Service } from '../storage/s3.service';
import { StorageService } from './storage.service';
import { TenantService } from '../tenant/tenant.service';

@Injectable()
export class DocumentStorageService {
  private readonly logger = new Logger(DocumentStorageService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly storageService: StorageService,
    private readonly s3Service: S3Service,
    private readonly tenantService: TenantService,
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
    this.assertTenantOwnership(key);

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

  async fileExists(key: string): Promise<boolean> {
    this.ensureStorageConfigured('download');

    if (this.shouldUseManagedStorage()) {
      return this.storageService.fileExists(key);
    }

    return this.s3Service.fileExists(key);
  }

  async listKeys(
    prefix: string,
    options?: { maxKeys?: number },
  ): Promise<string[]> {
    this.ensureStorageConfigured('download');

    if (this.shouldUseManagedStorage()) {
      return this.storageService.listKeys(prefix, options);
    }

    return this.s3Service.listKeys(prefix, options);
  }

  isStorageConfigured(): boolean {
    return this.shouldUseManagedStorage() || this.shouldUseLegacyS3();
  }

  getStorageConfigurationSummary(): {
    mode: 'managed' | 'legacy' | 'unconfigured';
    bucketName: string | null;
    endpoint: string | null;
  } {
    if (this.shouldUseManagedStorage()) {
      return {
        mode: 'managed',
        bucketName: this.configService.get<string>('AWS_BUCKET_NAME') || null,
        endpoint: this.configService.get<string>('AWS_ENDPOINT') || null,
      };
    }

    if (this.shouldUseLegacyS3()) {
      return {
        mode: 'legacy',
        bucketName: this.configService.get<string>('AWS_S3_BUCKET') || null,
        endpoint: this.configService.get<string>('AWS_S3_ENDPOINT') || null,
      };
    }

    return {
      mode: 'unconfigured',
      bucketName: null,
      endpoint: null,
    };
  }

  /**
   * Validates that the file key belongs to the current tenant's namespace.
   * Keys follow the pattern `documents/{companyId}/...`. If the current
   * request has a tenant context and the key targets a different company,
   * the request is blocked and logged.
   *
   * Skipped for super-admins and for keys outside the `documents/` prefix
   * (e.g. `reports/` which are user-scoped).
   */
  private assertTenantOwnership(key: string): void {
    if (!key.startsWith('documents/')) {
      return; // non-tenant-scoped key (reports, etc.)
    }

    const tenantId = this.tenantService.getTenantId();
    if (!tenantId) {
      return; // no tenant context (super-admin or public)
    }

    // Extract companyId from key: documents/{companyId}/...
    const segments = key.split('/');
    const keyTenantId = segments[1];

    if (keyTenantId && keyTenantId !== tenantId) {
      this.logger.error({
        event: 'presigned_url_tenant_mismatch',
        severity: 'CRITICAL',
        expectedTenant: tenantId,
        fileKeyTenant: keyTenantId,
        fileKeyPrefix: key.substring(0, 60),
      });
      throw new ForbiddenException(
        'Acesso negado: documento pertence a outra empresa.',
      );
    }
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
