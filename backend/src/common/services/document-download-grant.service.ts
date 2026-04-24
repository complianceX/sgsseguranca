import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { RequestContext } from '../middleware/request-context.middleware';
import { TenantService } from '../tenant/tenant.service';
import { DocumentDownloadGrant } from '../entities/document-download-grant.entity';
import {
  INTERNAL_DOWNLOAD_TTL_SECONDS,
  normalizeInternalDownloadTtl,
} from '../storage/storage-download-ttl';

type DownloadTokenPayload = {
  typ: 'document_download';
  gid: string;
  companyId: string;
  key: string;
};

@Injectable()
export class DocumentDownloadGrantService {
  private readonly logger = new Logger(DocumentDownloadGrantService.name);

  constructor(
    @InjectRepository(DocumentDownloadGrant)
    private readonly downloadGrantRepository: Repository<DocumentDownloadGrant>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly tenantService: TenantService,
  ) {}

  async issueRestrictedAppDownloadUrl(input: {
    fileKey: string;
    originalName?: string | null;
    companyId?: string | null;
    contentType?: string | null;
    expiresIn?: number;
  }): Promise<string> {
    const fileKey = String(input.fileKey || '').trim();
    if (!fileKey.startsWith('documents/')) {
      throw new BadRequestException(
        'Somente documentos oficiais em documents/ podem receber token de download restrito.',
      );
    }

    if (!/\.pdf$/i.test(fileKey)) {
      throw new BadRequestException(
        'Download restrito com token está habilitado apenas para PDFs governados.',
      );
    }

    const companyId =
      input.companyId?.trim() || this.extractCompanyIdFromDocumentsKey(fileKey);
    if (!companyId) {
      throw new BadRequestException(
        'Não foi possível resolver a empresa dona do documento governado.',
      );
    }

    const expiresIn = normalizeInternalDownloadTtl(
      input.expiresIn ?? INTERNAL_DOWNLOAD_TTL_SECONDS,
    );
    const grantId = randomUUID();
    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    const issuedForUserId = RequestContext.getUserId() || null;

    await this.tenantService.run(
      {
        companyId,
        isSuperAdmin: false,
        userId: issuedForUserId || undefined,
        siteScope: 'all',
      },
      () =>
        this.downloadGrantRepository.save(
          this.downloadGrantRepository.create({
            id: grantId,
            company_id: companyId,
            file_key: fileKey,
            original_name:
              this.normalizeOriginalName(input.originalName) || null,
            content_type: input.contentType?.trim() || 'application/pdf',
            issued_for_user_id: issuedForUserId,
            expires_at: expiresAt,
            consumed_at: null,
          }),
        ),
    );

    const token = jwt.sign(
      {
        typ: 'document_download',
        gid: grantId,
        companyId,
        key: fileKey,
      } satisfies DownloadTokenPayload,
      this.getSecret(),
      {
        algorithm: 'HS256',
        expiresIn,
      },
    );

    const path = `/storage/download/${token}`;
    const baseUrl = this.configService.get<string>('API_PUBLIC_URL')?.trim();

    this.logger.debug({
      event: 'document_download_grant_issued',
      grantId,
      companyId,
      fileKey,
      expiresIn,
      issuedForUserId,
    });

    if (!baseUrl) {
      return path;
    }

    return `${baseUrl.replace(/\/+$/, '')}${path}`;
  }

  async consumeToken(token: string): Promise<DocumentDownloadGrant> {
    const decoded = this.verifyToken(token);

    return this.tenantService.run(
      { companyId: decoded.companyId, isSuperAdmin: false, siteScope: 'all' },
      () =>
        this.dataSource.transaction(async (manager) => {
          const repository = manager.getRepository(DocumentDownloadGrant);
          const grant = await repository
            .createQueryBuilder('grant')
            .setLock('pessimistic_write')
            .where('grant.id = :id', { id: decoded.gid })
            .getOne();

          if (!grant) {
            throw new ForbiddenException(
              'Token de download inválido, expirado ou já consumido.',
            );
          }

          if (grant.consumed_at) {
            throw new ForbiddenException(
              'Token de download inválido, expirado ou já consumido.',
            );
          }

          if (grant.expires_at.getTime() <= Date.now()) {
            throw new ForbiddenException(
              'Token de download inválido, expirado ou já consumido.',
            );
          }

          if (
            grant.company_id !== decoded.companyId ||
            grant.file_key !== decoded.key
          ) {
            throw new ForbiddenException(
              'Token de download inválido, expirado ou já consumido.',
            );
          }

          grant.consumed_at = new Date();
          await repository.save(grant);

          this.logger.debug({
            event: 'document_download_grant_consumed',
            grantId: grant.id,
            companyId: grant.company_id,
            fileKey: grant.file_key,
          });

          return grant;
        }),
    );
  }

  private verifyToken(token: string): DownloadTokenPayload {
    try {
      const decoded = jwt.verify(token, this.getSecret(), {
        algorithms: ['HS256'],
      }) as jwt.JwtPayload;

      const typ = String(decoded.typ || '').trim();
      const gid = String(decoded.gid || '').trim();
      const companyId = String(decoded.companyId || '').trim();
      const key = String(decoded.key || '').trim();

      if (
        typ !== 'document_download' ||
        !gid ||
        !companyId ||
        !key.startsWith('documents/')
      ) {
        throw new Error('invalid_download_token_payload');
      }

      return {
        typ: 'document_download',
        gid,
        companyId,
        key,
      };
    } catch (error) {
      this.logger.warn({
        event: 'document_download_token_rejected',
        reason: error instanceof Error ? error.message : String(error),
      });
      throw new ForbiddenException(
        'Token de download inválido, expirado ou já consumido.',
      );
    }
  }

  private getSecret(): string {
    const secret = this.configService
      .get<string>('DOCUMENT_DOWNLOAD_TOKEN_SECRET')
      ?.trim();

    if (!secret) {
      throw new ServiceUnavailableException(
        'Serviço de download temporariamente indisponível.',
      );
    }

    return secret;
  }

  private extractCompanyIdFromDocumentsKey(fileKey: string): string | null {
    const segments = fileKey.split('/');
    return segments[1]?.trim() || null;
  }

  private normalizeOriginalName(originalName?: string | null): string | null {
    const normalized = String(originalName || '').trim();
    if (!normalized) {
      return null;
    }

    return normalized.replace(/[^\w.\- ]+/g, '_');
  }
}
