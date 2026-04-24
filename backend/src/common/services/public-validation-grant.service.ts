import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { TenantService } from '../tenant/tenant.service';
import { PublicValidationGrant } from '../entities/public-validation-grant.entity';
import {
  signValidationToken,
  ValidationTokenPayload,
  verifyValidationToken,
} from '../security/validation-token.util';

const DEFAULT_PUBLIC_VALIDATION_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;
const MAX_PUBLIC_VALIDATION_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

@Injectable()
export class PublicValidationGrantService {
  constructor(
    @InjectRepository(PublicValidationGrant)
    private readonly grantRepository: Repository<PublicValidationGrant>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly tenantService: TenantService,
  ) {}

  async issueToken(input: {
    code: string;
    companyId: string;
    portal?: string;
    documentId?: string | null;
    expiresInSeconds?: number;
  }): Promise<string> {
    const code = String(input.code || '')
      .trim()
      .toUpperCase();
    const companyId = String(input.companyId || '').trim();

    if (!code || !companyId) {
      throw new BadRequestException(
        'Código documental e empresa são obrigatórios para emitir token público.',
      );
    }

    if (this.isGlobalKillSwitchEnabled()) {
      throw new ServiceUnavailableException(
        'Validação pública temporariamente indisponível.',
      );
    }

    const grantId = randomUUID();
    const expiresInSeconds = this.resolveTokenTtlSeconds(
      input.expiresInSeconds,
    );
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    const portal = String(input.portal || 'public_validation').trim();

    await this.tenantService.run(
      { companyId, isSuperAdmin: false, siteScope: 'all' },
      () =>
        this.grantRepository.save(
          this.grantRepository.create({
            id: grantId,
            company_id: companyId,
            document_code: code,
            portal,
            document_id: input.documentId?.trim() || null,
            expires_at: expiresAt,
            revoked_at: null,
            disabled_at: null,
            last_validated_at: null,
          }),
        ),
    );

    return signValidationToken(
      {
        jti: grantId,
        code,
        companyId,
        portal,
      },
      { expiresIn: expiresInSeconds },
    );
  }

  async assertActiveToken(
    token: string,
    expectedCode?: string,
    expectedPortal?: string | string[],
  ): Promise<ValidationTokenPayload> {
    if (this.isGlobalKillSwitchEnabled()) {
      throw new ForbiddenException(
        'Validação pública temporariamente desabilitada.',
      );
    }

    const payload = verifyValidationToken(token);
    const normalizedExpectedCode = String(expectedCode || '')
      .trim()
      .toUpperCase();

    if (
      normalizedExpectedCode &&
      payload.code.toUpperCase() !== normalizedExpectedCode
    ) {
      throw new ForbiddenException('Token de validação inválido ou expirado.');
    }

    const allowedPortals = this.normalizeExpectedPortals(expectedPortal);
    if (allowedPortals.length > 0 && !allowedPortals.includes(payload.portal)) {
      throw new ForbiddenException('Token de validação inválido ou expirado.');
    }

    return this.tenantService.run(
      { companyId: payload.companyId, isSuperAdmin: false, siteScope: 'all' },
      () =>
        this.dataSource.transaction(async (manager) => {
          const repository = manager.getRepository(PublicValidationGrant);
          const grant = await repository
            .createQueryBuilder('grant')
            .setLock('pessimistic_write')
            .where('grant.id = :id', { id: payload.jti })
            .getOne();

          if (!grant) {
            throw new ForbiddenException(
              'Token de validação inválido ou expirado.',
            );
          }

          if (grant.revoked_at || grant.disabled_at) {
            throw new ForbiddenException(
              'Token de validação inválido ou expirado.',
            );
          }

          if (grant.expires_at.getTime() <= Date.now()) {
            throw new ForbiddenException(
              'Token de validação inválido ou expirado.',
            );
          }

          if (
            grant.company_id !== payload.companyId ||
            grant.document_code.toUpperCase() !== payload.code.toUpperCase() ||
            grant.portal !== payload.portal
          ) {
            throw new ForbiddenException(
              'Token de validação inválido ou expirado.',
            );
          }

          grant.last_validated_at = new Date();
          await repository.save(grant);

          return payload;
        }),
    );
  }

  async revokeGrant(grantId: string): Promise<void> {
    await this.tenantService.run(
      { companyId: undefined, isSuperAdmin: true, siteScope: 'all' },
      () =>
        this.dataSource.transaction(async (manager) => {
          await manager
            .getRepository(PublicValidationGrant)
            .createQueryBuilder()
            .update(PublicValidationGrant)
            .set({ revoked_at: () => 'CURRENT_TIMESTAMP' })
            .where('id = :grantId', { grantId })
            .execute();
        }),
    );
  }

  async revokeCompanyCode(companyId: string, code: string): Promise<void> {
    const normalizedCompanyId = companyId.trim();
    await this.tenantService.run(
      { companyId: normalizedCompanyId, isSuperAdmin: false, siteScope: 'all' },
      () =>
        this.grantRepository
          .createQueryBuilder()
          .update(PublicValidationGrant)
          .set({ revoked_at: () => 'CURRENT_TIMESTAMP' })
          .where('company_id = :companyId', { companyId: normalizedCompanyId })
          .andWhere('document_code = :code', {
            code: code.trim().toUpperCase(),
          })
          .andWhere('revoked_at IS NULL')
          .execute(),
    );
  }

  private resolveTokenTtlSeconds(candidate?: number): number {
    const configured = Number(
      candidate ??
        this.configService.get<string>('PUBLIC_VALIDATION_TOKEN_TTL_SECONDS') ??
        DEFAULT_PUBLIC_VALIDATION_TOKEN_TTL_SECONDS,
    );

    if (!Number.isFinite(configured) || configured <= 0) {
      return DEFAULT_PUBLIC_VALIDATION_TOKEN_TTL_SECONDS;
    }

    return Math.min(
      Math.floor(configured),
      MAX_PUBLIC_VALIDATION_TOKEN_TTL_SECONDS,
    );
  }

  private isGlobalKillSwitchEnabled(): boolean {
    const raw = this.configService.get<boolean | string>(
      'PUBLIC_VALIDATION_KILL_SWITCH',
      false,
    );

    if (typeof raw === 'boolean') {
      return raw;
    }

    return (
      String(raw || '')
        .trim()
        .toLowerCase() === 'true'
    );
  }

  private normalizeExpectedPortals(
    expectedPortal?: string | string[],
  ): string[] {
    if (!expectedPortal) {
      return [];
    }

    return (Array.isArray(expectedPortal) ? expectedPortal : [expectedPortal])
      .map((portal) => portal.trim())
      .filter(Boolean);
  }
}
