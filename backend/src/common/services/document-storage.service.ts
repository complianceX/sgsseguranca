import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Readable } from 'stream';
import {
  extractResilienceErrorCode,
  extractResilienceErrorMessage,
  extractResilienceErrorStatus,
} from '../resilience/resilience-error.util';
import { S3Service } from '../storage/s3.service';
import { StorageService } from './storage.service';
import { TenantService } from '../tenant/tenant.service';
import { DocumentDownloadGrantService } from './document-download-grant.service';
import {
  EMAIL_LINK_DOWNLOAD_TTL_SECONDS,
  INTERNAL_DOWNLOAD_TTL_SECONDS,
  normalizeEmailLinkDownloadTtl,
  normalizeInternalDownloadTtl,
} from '../storage/storage-download-ttl';

@Injectable()
export class DocumentStorageService {
  private readonly logger = new Logger(DocumentStorageService.name);
  private localStorageDirCache: string | null | undefined;

  constructor(
    private readonly configService: ConfigService,
    private readonly storageService: StorageService,
    private readonly s3Service: S3Service,
    private readonly tenantService: TenantService,
    private readonly documentDownloadGrantService: DocumentDownloadGrantService,
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
    try {
      if (this.shouldUseLocalFsStorage()) {
        const buffer = await this.toBuffer(file);
        await this.writeLocalFile(key, buffer);
        return;
      }

      if (this.shouldUseManagedStorage()) {
        const buffer = await this.toBuffer(file);
        await this.storageService.uploadFile(key, buffer, contentType);
        return;
      }

      await this.s3Service.uploadFile(key, file, contentType, metadata);
    } catch (error) {
      this.handleStorageError('upload', key, error);
    }
  }

  async getSignedUrl(
    key: string,
    expiresIn = INTERNAL_DOWNLOAD_TTL_SECONDS,
  ): Promise<string> {
    return this.issueSignedUrl(key, normalizeInternalDownloadTtl(expiresIn));
  }

  /**
   * Uso explícito para links enviados por e-mail.
   *
   * Não use este método para navegação interna do app. O TTL estendido
   * (até 24h) é reservado apenas para mensagens assíncronas onde o usuário
   * pode abrir o link fora da sessão web ativa.
   */
  async getEmailLinkSignedUrl(
    key: string,
    expiresIn = EMAIL_LINK_DOWNLOAD_TTL_SECONDS,
  ): Promise<string> {
    return this.issueSignedUrl(key, normalizeEmailLinkDownloadTtl(expiresIn), {
      emailLink: true,
    });
  }

  async getPresignedDownloadUrl(
    key: string,
    expiresIn = INTERNAL_DOWNLOAD_TTL_SECONDS,
  ): Promise<string> {
    return this.getSignedUrl(key, expiresIn);
  }

  private async issueSignedUrl(
    key: string,
    expiresIn: number,
    options?: { emailLink?: boolean },
  ): Promise<string> {
    this.ensureStorageConfigured('presign');
    this.assertTenantOwnership(key);
    try {
      if (!options?.emailLink && this.shouldUseRestrictedAppDownload(key)) {
        return await this.documentDownloadGrantService.issueRestrictedAppDownloadUrl(
          {
            fileKey: key,
            originalName: key.split('/').pop() || null,
            expiresIn,
          },
        );
      }

      if (this.shouldUseManagedStorage()) {
        return options?.emailLink
          ? await this.storageService.getEmailLinkPresignedDownloadUrl(
              key,
              expiresIn,
            )
          : await this.storageService.getPresignedDownloadUrl(key, expiresIn);
      }

      return options?.emailLink
        ? await this.s3Service.getEmailLinkSignedUrl(key, expiresIn)
        : await this.s3Service.getSignedUrl(key, expiresIn);
    } catch (error) {
      this.handleStorageError('presign', key, error);
    }
  }

  async downloadFileBuffer(key: string): Promise<Buffer> {
    this.ensureStorageConfigured('download');
    try {
      if (this.shouldUseLocalFsStorage()) {
        return await this.readLocalFile(key);
      }

      if (this.shouldUseManagedStorage()) {
        return await this.storageService.downloadFileBuffer(key);
      }

      return await this.s3Service.downloadFile(key);
    } catch (error) {
      this.handleStorageError('download', key, error);
    }
  }

  async deleteFile(key: string): Promise<void> {
    this.ensureStorageConfigured('delete');
    try {
      if (this.shouldUseLocalFsStorage()) {
        await this.deleteLocalFile(key);
        return;
      }

      if (this.shouldUseManagedStorage()) {
        await this.storageService.deleteFile(key);
        return;
      }

      await this.s3Service.deleteFile(key);
    } catch (error) {
      this.handleStorageError('delete', key, error);
    }
  }

  async fileExists(key: string): Promise<boolean> {
    this.ensureStorageConfigured('download');
    try {
      if (this.shouldUseLocalFsStorage()) {
        return await this.localFileExists(key);
      }

      if (this.shouldUseManagedStorage()) {
        return await this.storageService.fileExists(key);
      }

      return await this.s3Service.fileExists(key);
    } catch (error) {
      this.handleStorageError('download', key, error);
    }
  }

  async listKeys(
    prefix: string,
    options?: { maxKeys?: number },
  ): Promise<string[]> {
    this.ensureStorageConfigured('download');
    try {
      if (this.shouldUseLocalFsStorage()) {
        return await this.listLocalKeys(prefix, options);
      }

      if (this.shouldUseManagedStorage()) {
        return await this.storageService.listKeys(prefix, options);
      }

      return await this.s3Service.listKeys(prefix, options);
    } catch (error) {
      this.handleStorageError('download', prefix, error);
    }
  }

  isStorageConfigured(): boolean {
    return (
      this.shouldUseManagedStorage() ||
      this.shouldUseLegacyS3() ||
      this.shouldUseLocalFsStorage()
    );
  }

  getStorageConfigurationSummary(): {
    mode: 'managed' | 'legacy' | 'local_fs' | 'unconfigured';
    bucketName: string | null;
    endpoint: string | null;
  } {
    if (this.shouldUseLocalFsStorage()) {
      return {
        mode: 'local_fs',
        bucketName: null,
        endpoint: this.getLocalFsStorageDir(),
      };
    }

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
   *
   * P1 guardrail: arquivos em `quarantine/` nunca podem ser baixados via
   * presigned URL — apenas o endpoint /storage/complete-upload os acessa.
   */
  private assertTenantOwnership(key: string): void {
    // P1: bloquear download direto de arquivos ainda em quarentena
    if (key.startsWith('quarantine/')) {
      this.logger.error({
        event: 'quarantine_download_attempt_blocked',
        severity: 'HIGH',
        keyPrefix: key.substring(0, 60),
      });
      throw new ForbiddenException(
        'Acesso negado: documento ainda está em quarentena. Use /storage/complete-upload para promovê-lo.',
      );
    }

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

  private getLocalFsStorageDir(): string | null {
    if (this.localStorageDirCache !== undefined) {
      return this.localStorageDirCache;
    }

    const explicit = this.configService
      .get<string>('LOCAL_DOCUMENT_STORAGE_DIR')
      ?.trim();
    if (explicit) {
      this.localStorageDirCache = explicit;
      return explicit;
    }

    // Dev fallback: sem S3 configurado, gravar em disco local para manter o módulo funcional.
    if (
      process.env.NODE_ENV === 'development' &&
      !this.shouldUseManagedStorage() &&
      !this.shouldUseLegacyS3()
    ) {
      const fallback = path.resolve(
        process.cwd(),
        'temp',
        'local-document-storage',
      );
      this.localStorageDirCache = fallback;
      this.logger.warn({
        event: 'document_storage_local_fs_fallback_enabled',
        storageDir: fallback,
      });
      return fallback;
    }

    this.localStorageDirCache = null;
    return null;
  }

  private shouldUseLocalFsStorage(): boolean {
    return Boolean(this.getLocalFsStorageDir());
  }

  private shouldUseRestrictedAppDownload(key: string): boolean {
    return key.startsWith('documents/') && /\.pdf$/i.test(key);
  }

  private ensureStorageConfigured(
    action: 'upload' | 'presign' | 'download' | 'delete',
  ): void {
    if (
      this.shouldUseManagedStorage() ||
      this.shouldUseLegacyS3() ||
      this.shouldUseLocalFsStorage()
    ) {
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

  private handleStorageError(
    action: 'upload' | 'presign' | 'download' | 'delete',
    key: string,
    error: unknown,
  ): never {
    const message =
      extractResilienceErrorMessage(error) || 'Erro desconhecido no storage.';
    const code = extractResilienceErrorCode(error);
    const status = extractResilienceErrorStatus(error);

    this.logger.error({
      event: 'document_storage_operation_failed',
      action,
      key,
      code,
      status,
      message,
    });

    if (
      error instanceof ForbiddenException ||
      error instanceof ServiceUnavailableException ||
      error instanceof NotFoundException
    ) {
      throw error;
    }

    if (
      status === 404 ||
      code === 'NotFound' ||
      code === 'NoSuchKey' ||
      /nao encontrado|não encontrado|not found|no such key/i.test(message)
    ) {
      throw new NotFoundException({
        error: 'DOCUMENT_STORAGE_OBJECT_NOT_FOUND',
        message:
          'O artefato oficial foi referenciado, mas não está disponível no storage governado.',
        details: {
          action,
          key,
          code,
          status,
        },
      });
    }

    throw new ServiceUnavailableException({
      error: 'DOCUMENT_STORAGE_OPERATION_FAILED',
      message:
        action === 'presign'
          ? 'Não foi possível resolver a URL segura do artefato governado no momento.'
          : 'O storage governado está temporariamente indisponível para esta operação.',
      details: {
        action,
        code,
        status,
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

  private resolveLocalFilePath(key: string): string {
    const baseDir = this.getLocalFsStorageDir();
    if (!baseDir) {
      throw new Error('Local FS storage dir não configurado.');
    }

    // Normaliza separadores e impede path traversal.
    const normalizedKey = key.replace(/\\/g, '/').replace(/^\/+/, '');
    const resolvedBase = path.resolve(baseDir);
    const resolved = path.resolve(resolvedBase, normalizedKey);
    if (!resolved.startsWith(resolvedBase + path.sep)) {
      throw new Error('Chave de storage inválida (path traversal detectado).');
    }

    return resolved;
  }

  private async writeLocalFile(key: string, buffer: Buffer): Promise<void> {
    const target = this.resolveLocalFilePath(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, buffer);
  }

  private async readLocalFile(key: string): Promise<Buffer> {
    const target = this.resolveLocalFilePath(key);
    try {
      return await fs.readFile(target);
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === 'ENOENT') {
        throw new NotFoundException({
          error: 'DOCUMENT_STORAGE_OBJECT_NOT_FOUND',
          message:
            'O artefato oficial foi referenciado, mas não está disponível no storage governado.',
          details: { action: 'download', key },
        });
      }
      throw error;
    }
  }

  private async deleteLocalFile(key: string): Promise<void> {
    const target = this.resolveLocalFilePath(key);
    try {
      await fs.unlink(target);
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === 'ENOENT') {
        return;
      }
      throw error;
    }
  }

  private async localFileExists(key: string): Promise<boolean> {
    const target = this.resolveLocalFilePath(key);
    try {
      await fs.stat(target);
      return true;
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  private async listLocalKeys(
    prefix: string,
    options?: { maxKeys?: number },
  ): Promise<string[]> {
    const baseDir = this.getLocalFsStorageDir();
    if (!baseDir) {
      return [];
    }

    const normalizedPrefix = prefix.replace(/\\/g, '/').replace(/^\/+/, '');
    const prefixClean = normalizedPrefix.replace(/\/+$/, '');
    const resolvedBase = path.resolve(baseDir);
    const root = path.resolve(resolvedBase, normalizedPrefix);
    if (!root.startsWith(resolvedBase + path.sep)) {
      return [];
    }

    const maxKeys =
      options?.maxKeys && options.maxKeys > 0 ? options.maxKeys : null;
    const results: string[] = [];

    const walk = async (dir: string, relative: string) => {
      if (maxKeys && results.length >= maxKeys) {
        return;
      }
      let entries: Array<import('node:fs').Dirent>;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch (error) {
        const code = (error as { code?: string })?.code;
        if (code === 'ENOENT') {
          return;
        }
        throw error;
      }

      for (const entry of entries) {
        if (maxKeys && results.length >= maxKeys) {
          return;
        }
        const nextRelative = relative
          ? `${relative}/${entry.name}`
          : entry.name;
        const nextPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(nextPath, nextRelative);
        } else if (entry.isFile()) {
          results.push(
            (prefixClean
              ? `${prefixClean}/${nextRelative}`
              : nextRelative
            ).replace(/^\/+/, ''),
          );
        }
      }
    };

    await walk(root, '');
    return results;
  }
}
