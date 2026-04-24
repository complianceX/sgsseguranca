import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { createHash } from 'crypto';
import {
  ConsentType,
  ConsentVersion,
} from './entities/consent-version.entity';
import { UserConsent } from './entities/user-consent.entity';
import { TenantService } from '../common/tenant/tenant.service';
import {
  ConsentStatusEntryDto,
  ConsentStatusResponseDto,
} from './dto/consent-status.dto';

export interface ConsentCaptureMeta {
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Computa o SHA-256 hex do body Markdown. Determinístico — serve como prova
 * de que a versão persistida não foi alterada após aceites.
 */
export function computeConsentBodyHash(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex');
}

@Injectable()
export class ConsentsService {
  private readonly logger = new Logger(ConsentsService.name);

  constructor(
    @InjectRepository(ConsentVersion)
    private readonly versionsRepo: Repository<ConsentVersion>,
    @InjectRepository(UserConsent)
    private readonly userConsentsRepo: Repository<UserConsent>,
    private readonly tenantService: TenantService,
  ) {}

  /**
   * Retorna a versão ativa (sem retired_at) de um tipo. Throws se nenhuma
   * versão estiver publicada para o tipo.
   */
  async getActiveVersion(type: ConsentType): Promise<ConsentVersion> {
    const active = await this.versionsRepo.findOne({
      where: { type, retired_at: IsNull() },
    });
    if (!active) {
      throw new NotFoundException(
        `Nenhuma versão ativa publicada para o consentimento '${type}'.`,
      );
    }
    return active;
  }

  /**
   * Busca uma versão específica por rótulo.
   */
  async getVersionByLabel(
    type: ConsentType,
    versionLabel: string,
  ): Promise<ConsentVersion> {
    const version = await this.versionsRepo.findOne({
      where: { type, version_label: versionLabel },
    });
    if (!version) {
      throw new NotFoundException(
        `Versão '${versionLabel}' não encontrada para consentimento '${type}'.`,
      );
    }
    return version;
  }

  /**
   * Retorna o aceite MAIS RECENTE de um tipo para um usuário.
   * Considerado "ativo" se revoked_at é null e aponta para a versão vigente.
   */
  async getLatestAcceptance(
    userId: string,
    type: ConsentType,
  ): Promise<UserConsent | null> {
    return this.userConsentsRepo.findOne({
      where: { user_id: userId, type },
      order: { created_at: 'DESC' },
    });
  }

  /**
   * Verifica se o usuário tem consentimento ativo para a versão ATUAL do tipo.
   * Se a versão atual mudou e o aceite era de uma versão retirada, retorna false
   * (força re-aceite).
   */
  async hasActiveConsent(userId: string, type: ConsentType): Promise<boolean> {
    const activeVersion = await this.versionsRepo.findOne({
      where: { type, retired_at: IsNull() },
    });
    if (!activeVersion) {
      // Sem versão publicada, ninguém pode consentir; por segurança retornamos false.
      return false;
    }

    const latest = await this.getLatestAcceptance(userId, type);
    if (!latest) return false;
    if (latest.revoked_at) return false;
    if (!latest.accepted_at) return false;
    return latest.version_id === activeVersion.id;
  }

  /**
   * Registra aceite. Captura IP e User-Agent como prova material.
   * Sempre cria nova linha — jamais sobrescreve. Consentimento prévio
   * da mesma versão é considerado idempotente (retorna o existente).
   */
  async accept(
    userId: string,
    type: ConsentType,
    versionLabel: string | undefined,
    meta: ConsentCaptureMeta,
  ): Promise<UserConsent> {
    const tenantId = this.tenantService.getTenantId();
    if (!tenantId) {
      throw new UnauthorizedException(
        'Contexto de empresa não identificado para registrar consentimento.',
      );
    }

    const version = versionLabel
      ? await this.getVersionByLabel(type, versionLabel)
      : await this.getActiveVersion(type);

    // Idempotência: se o último aceite do usuário é desta mesma versão e
    // está ativo, apenas retorna. Evita duplicar linhas por double-click.
    const latest = await this.getLatestAcceptance(userId, type);
    if (
      latest &&
      latest.version_id === version.id &&
      latest.accepted_at &&
      !latest.revoked_at
    ) {
      return latest;
    }

    const entry = this.userConsentsRepo.create({
      user_id: userId,
      company_id: tenantId,
      type,
      version_id: version.id,
      accepted_at: new Date(),
      accepted_ip: meta.ip ?? null,
      accepted_user_agent: meta.userAgent ?? null,
      migrated_from_legacy: false,
    });
    const saved = await this.userConsentsRepo.save(entry);

    this.logger.log({
      event: 'consent_accepted',
      userId,
      type,
      versionId: version.id,
      versionLabel: version.version_label,
      companyId: tenantId,
    });

    return saved;
  }

  /**
   * Revoga consentimento. Cria nova linha referenciando a mesma versão que o
   * titular aceitou (para preservar a prova histórica do que foi revogado).
   */
  async revoke(
    userId: string,
    type: ConsentType,
    meta: ConsentCaptureMeta,
  ): Promise<UserConsent | null> {
    const tenantId = this.tenantService.getTenantId();
    if (!tenantId) {
      throw new UnauthorizedException(
        'Contexto de empresa não identificado para revogar consentimento.',
      );
    }

    const latest = await this.getLatestAcceptance(userId, type);
    if (!latest) {
      return null; // nada para revogar
    }
    if (latest.revoked_at) {
      return latest; // já revogado; idempotente
    }

    const revocation = this.userConsentsRepo.create({
      user_id: userId,
      company_id: tenantId,
      type,
      version_id: latest.version_id,
      accepted_at: latest.accepted_at,
      accepted_ip: latest.accepted_ip,
      accepted_user_agent: latest.accepted_user_agent,
      revoked_at: new Date(),
      revoked_ip: meta.ip ?? null,
      revoked_user_agent: meta.userAgent ?? null,
      notes: 'Revogação registrada pelo titular.',
    });
    const saved = await this.userConsentsRepo.save(revocation);

    this.logger.log({
      event: 'consent_revoked',
      userId,
      type,
      revokedVersionId: latest.version_id,
      companyId: tenantId,
    });

    return saved;
  }

  /**
   * Snapshot do estado de todos os tipos de consentimento para um usuário.
   * Usado por /auth/me e pela tela /dashboard/privacidade.
   */
  async getStatus(userId: string): Promise<ConsentStatusResponseDto> {
    const versions = await this.versionsRepo.find({
      where: { retired_at: IsNull() },
    });
    const activeByType = new Map<ConsentType, ConsentVersion>();
    for (const v of versions) {
      activeByType.set(v.type, v);
    }

    const consents: ConsentStatusEntryDto[] = [];
    const types: ConsentType[] = [
      'privacy',
      'terms',
      'cookies',
      'ai_processing',
      'marketing',
    ];

    for (const type of types) {
      const current = activeByType.get(type) || null;
      const latest = await this.getLatestAcceptance(userId, type);
      const accepted =
        !!latest && !!latest.accepted_at && !latest.revoked_at;
      const matchesCurrent =
        accepted && !!current && latest!.version_id === current.id;

      consents.push({
        type,
        active: matchesCurrent,
        acceptedVersionLabel: accepted && latest?.version
          ? latest.version.version_label
          : null,
        currentVersionLabel: current?.version_label ?? null,
        needsReacceptance: accepted && !!current && !matchesCurrent,
        acceptedAt: latest?.accepted_at?.toISOString() ?? null,
        revokedAt: latest?.revoked_at?.toISOString() ?? null,
        migratedFromLegacy: Boolean(latest?.migrated_from_legacy),
      });
    }

    return { consents };
  }

  /**
   * Upsert idempotente de uma versão. Usado pelo seed e por operações
   * administrativas de publicação. Se o body mudar, cria NOVA versão
   * e marca a anterior como retired.
   */
  async publishVersion(params: {
    type: ConsentType;
    versionLabel: string;
    bodyMd: string;
    summary?: string;
    effectiveAt?: Date;
  }): Promise<ConsentVersion> {
    const bodyHash = computeConsentBodyHash(params.bodyMd);

    const existingLabel = await this.versionsRepo.findOne({
      where: { type: params.type, version_label: params.versionLabel },
    });
    if (existingLabel) {
      // Mesma label → valida integridade do body.
      if (existingLabel.body_hash !== bodyHash) {
        throw new Error(
          `Integridade violada: consent_versions(type=${params.type}, version=${params.versionLabel}) ja existe com body diferente. Publique uma nova versao em vez de modificar a existente.`,
        );
      }
      return existingLabel;
    }

    // Retira versao ativa atual (se houver).
    const currentActive = await this.versionsRepo.findOne({
      where: { type: params.type, retired_at: IsNull() },
    });
    if (currentActive) {
      currentActive.retired_at = new Date();
      await this.versionsRepo.save(currentActive);
    }

    const created = this.versionsRepo.create({
      type: params.type,
      version_label: params.versionLabel,
      body_md: params.bodyMd,
      body_hash: bodyHash,
      summary: params.summary ?? null,
      effective_at: params.effectiveAt ?? new Date(),
    });
    return this.versionsRepo.save(created);
  }
}
