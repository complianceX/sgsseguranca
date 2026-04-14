import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import { Role } from './enums/roles.enum';
import {
  decodeJwtPayloadUnsafe,
  looksLikeSupabaseAccessTokenPayload,
  NormalizedAccessTokenClaims,
  normalizeAccessTokenClaims,
  resolveAccessTokenSecret,
} from './utils/access-token-claims.util';

export type AuthenticatedPrincipal = {
  id: string;
  userId: string;
  sub: string;
  app_user_id: string;
  jti?: string;
  authUserId?: string;
  auth_user_id?: string;
  cpf?: string;
  company_id?: string;
  companyId?: string;
  profile?: { nome: string };
  plan?: string;
  isSuperAdmin: boolean;
  tokenSource: 'local' | 'supabase';
};

type UserBridgeRecord = {
  id: string;
  authUserId?: string | null;
  cpf?: string | null;
  companyId?: string | null;
  profileName?: string | null;
};

type JwtVerifyResult = string | jwt.JwtPayload;

type UserBridgeQueryRow = {
  id: string;
  auth_user_id?: string | null;
  cpf?: string | null;
  company_id?: string | null;
  profile_nome?: string | null;
};

@Injectable()
export class AuthPrincipalService {
  private readonly logger = new Logger(AuthPrincipalService.name);
  private readonly bridgeCache = new Map<
    string,
    { value: UserBridgeRecord; expiresAt: number }
  >();
  private readonly bridgeLookupsInFlight = new Map<
    string,
    Promise<UserBridgeRecord | null>
  >();

  constructor(
    private readonly configService: ConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async verifyAndResolveAccessToken(
    token: string,
  ): Promise<AuthenticatedPrincipal> {
    const payload = this.verifyAccessToken(token);
    return this.resolveAccessPrincipal(payload);
  }

  async resolveAccessPrincipal(
    payload: Record<string, unknown>,
  ): Promise<AuthenticatedPrincipal> {
    const normalized = this.normalizeBaseClaims(payload);
    const tokenSource = looksLikeSupabaseAccessTokenPayload(payload)
      ? 'supabase'
      : 'local';
    const subject = readString(payload, 'sub');
    const authUserId =
      normalized.auth_user_id ||
      (tokenSource === 'supabase' ? subject : undefined);

    let appUserId =
      tokenSource === 'supabase' && !hasExplicitAppUserIdClaim(payload)
        ? undefined
        : normalized.app_user_id || normalized.userId;
    let cpf = normalized.cpf;
    let companyId = normalized.company_id;
    let profileName = normalized.profile?.nome;
    const plan = normalized.plan;
    const isSuperAdmin =
      normalized.isSuperAdmin || isSuperAdminProfileName(profileName);

    if (authUserId && (!appUserId || !companyId || !profileName)) {
      const bridge = await this.findUserBridge({
        authUserId,
        appUserId,
      });
      appUserId = appUserId || bridge?.id || undefined;
      cpf = cpf || bridge?.cpf || undefined;
      companyId = companyId || bridge?.companyId || undefined;
      profileName = profileName || bridge?.profileName || undefined;
    } else if (appUserId && (!companyId || !profileName)) {
      const bridge = await this.findUserBridge({ appUserId });
      cpf = cpf || bridge?.cpf || undefined;
      companyId = companyId || bridge?.companyId || undefined;
      profileName = profileName || bridge?.profileName || undefined;
    }

    if (!appUserId) {
      this.logger.warn({
        event: 'auth_principal_unresolved',
        tokenSource,
        authUserId: authUserId || null,
      });
      throw new UnauthorizedException(
        'Token inválido: usuário da aplicação não resolvido.',
      );
    }

    return {
      id: appUserId,
      userId: appUserId,
      sub: appUserId,
      app_user_id: appUserId,
      jti: normalized.jti,
      authUserId,
      auth_user_id: authUserId,
      cpf,
      company_id: companyId,
      companyId,
      profile: profileName ? { nome: profileName } : undefined,
      plan,
      isSuperAdmin,
      tokenSource,
    };
  }

  private verifyAccessToken(token: string): Record<string, unknown> {
    const payload = decodeJwtPayloadUnsafe(token);
    const secret = resolveAccessTokenSecret(this.configService, token, payload);
    const verified = this.verifyJwt(token, secret);
    if (verified && typeof verified === 'object' && !Array.isArray(verified)) {
      return verified as Record<string, unknown>;
    }

    const supabaseSecret = getSupabaseJwtSecret(this.configService);
    const localSecret = this.configService.get<string>('JWT_SECRET')?.trim();
    const shouldRetryWithSupabase =
      Boolean(supabaseSecret) && secret !== supabaseSecret;
    const shouldRetryWithLocal = Boolean(localSecret) && secret !== localSecret;

    if (shouldRetryWithSupabase) {
      const retry = this.verifyJwt(token, supabaseSecret!);
      if (retry && typeof retry === 'object' && !Array.isArray(retry)) {
        return retry as Record<string, unknown>;
      }
    }

    if (shouldRetryWithLocal) {
      const retry = this.verifyJwt(token, localSecret!);
      if (retry && typeof retry === 'object' && !Array.isArray(retry)) {
        return retry as Record<string, unknown>;
      }
    }

    throw new UnauthorizedException('Token inválido');
  }

  private verifyJwt(token: string, secret: string): JwtVerifyResult | null {
    try {
      return jwt.verify(token, secret);
    } catch {
      return null;
    }
  }

  private normalizeBaseClaims(
    payload: Record<string, unknown>,
  ): NormalizedAccessTokenClaims {
    const claims = normalizeAccessTokenClaims(payload);

    return {
      ...claims,
      app_user_id: claims.app_user_id,
    };
  }

  private async findUserBridge(params: {
    authUserId?: string;
    appUserId?: string;
  }): Promise<UserBridgeRecord | null> {
    if (!params.authUserId && !params.appUserId) {
      return null;
    }

    const cacheKeys = this.getBridgeCacheKeys(params);
    for (const cacheKey of cacheKeys) {
      const cached = this.readBridgeCache(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const inflightKey = cacheKeys[0];
    const inFlightLookup = this.bridgeLookupsInFlight.get(inflightKey);
    if (inFlightLookup) {
      return inFlightLookup;
    }

    const lookupPromise = this.lookupUserBridge(params)
      .then((result) => {
        if (result) {
          this.writeBridgeCache(result);
        }
        return result;
      })
      .finally(() => {
        this.bridgeLookupsInFlight.delete(inflightKey);
      });

    this.bridgeLookupsInFlight.set(inflightKey, lookupPromise);
    return lookupPromise;
  }

  private async lookupUserBridge(
    params: {
      authUserId?: string;
      appUserId?: string;
    },
  ): Promise<UserBridgeRecord | null> {
    const rows = (await this.dataSource.query(
      `
        WITH _ctx AS (
          SELECT set_config('app.is_super_admin', 'true', true)
        )
        SELECT
          u.id,
          u.auth_user_id,
          u.cpf,
          u.company_id,
          p.nome AS profile_nome
        FROM _ctx, users u
        LEFT JOIN profiles p
          ON p.id = u.profile_id
        WHERE u.status = true
          AND u.deleted_at IS NULL
          AND (
            ($1::uuid IS NOT NULL AND u.auth_user_id = $1::uuid)
            OR ($2::uuid IS NOT NULL AND u.id = $2::uuid)
          )
        ORDER BY
          CASE
            WHEN ($1::uuid IS NOT NULL AND u.auth_user_id = $1::uuid) THEN 0
            ELSE 1
          END
        LIMIT 1
      `,
      [params.authUserId || null, params.appUserId || null],
    )) as unknown;

    if (!Array.isArray(rows) || rows.length === 0) {
      return null;
    }

    const user = rows[0] as UserBridgeQueryRow;
    return {
      id: user.id,
      authUserId: user.auth_user_id,
      cpf: user.cpf,
      companyId: user.company_id,
      profileName: user.profile_nome || undefined,
    };
  }

  private readBridgeCache(cacheKey: string): UserBridgeRecord | null {
    const cached = this.bridgeCache.get(cacheKey);
    if (!cached) {
      return null;
    }

    if (cached.expiresAt <= Date.now()) {
      this.bridgeCache.delete(cacheKey);
      return null;
    }

    return cached.value;
  }

  private writeBridgeCache(record: UserBridgeRecord): void {
    const ttlMs = this.getBridgeCacheTtlMs();
    if (ttlMs <= 0) {
      return;
    }

    const expiresAt = Date.now() + ttlMs;
    for (const cacheKey of this.getBridgeCacheKeys({
      authUserId: record.authUserId || undefined,
      appUserId: record.id,
    })) {
      this.bridgeCache.set(cacheKey, {
        value: record,
        expiresAt,
      });
    }
  }

  private getBridgeCacheKeys(params: {
    authUserId?: string;
    appUserId?: string;
  }): string[] {
    const keys = [
      params.authUserId
        ? `auth-principal:bridge:auth:${params.authUserId}`
        : null,
      params.appUserId ? `auth-principal:bridge:app:${params.appUserId}` : null,
    ].filter((value): value is string => Boolean(value));

    return keys.length > 0 ? keys : ['auth-principal:bridge:unknown'];
  }

  private getBridgeCacheTtlMs(): number {
    const raw = Number(
      process.env.AUTH_PRINCIPAL_BRIDGE_CACHE_TTL_SECONDS || 60,
    );

    if (!Number.isFinite(raw) || raw <= 0) {
      return 0;
    }

    return Math.min(Math.floor(raw), 300) * 1000;
  }
}

function readString(
  source: Record<string, unknown> | null | undefined,
  key: string,
): string | undefined {
  const value = source?.[key];
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function isSuperAdminProfileName(profileName?: string): boolean {
  return profileName === Role.ADMIN_GERAL;
}

function hasExplicitAppUserIdClaim(payload: Record<string, unknown>): boolean {
  const direct =
    readString(payload, 'app_user_id') || readString(payload, 'app_userId');
  if (direct) {
    return true;
  }

  const appMetadata = payload.app_metadata;
  if (typeof appMetadata !== 'object' || appMetadata === null) {
    return false;
  }

  const appMetadataRecord = appMetadata as Record<string, unknown>;
  return Boolean(
    readString(appMetadataRecord, 'app_user_id') ||
    readString(appMetadataRecord, 'app_userId') ||
    readString(appMetadataRecord, 'user_id'),
  );
}

function getSupabaseJwtSecret(
  configService: ConfigService,
): string | undefined {
  const secret = configService.get<string>('SUPABASE_JWT_SECRET')?.trim();
  return secret || undefined;
}
