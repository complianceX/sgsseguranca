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
import { User } from '../users/entities/user.entity';
import { Profile } from '../profiles/entities/profile.entity';

export type AuthenticatedPrincipal = {
  id: string;
  userId: string;
  sub: string;
  app_user_id: string;
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

@Injectable()
export class AuthPrincipalService {
  private readonly logger = new Logger(AuthPrincipalService.name);

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

    return this.dataSource.transaction(async (manager) => {
      await manager.query("SET LOCAL app.is_super_admin = 'true'");
      const user = await manager.findOne(User, {
        where: params.authUserId
          ? { auth_user_id: params.authUserId, status: true }
          : { id: params.appUserId, status: true },
        relations: { profile: true },
        select: {
          id: true,
          auth_user_id: true,
          cpf: true,
          company_id: true,
          status: true,
          profile: {
            id: true,
            nome: true,
          } as Partial<Record<keyof Profile, boolean>>,
        },
      });

      if (!user) {
        return null;
      }

      return {
        id: user.id,
        authUserId: user.auth_user_id,
        cpf: user.cpf,
        companyId: user.company_id,
        profileName: user.profile?.nome || undefined,
      };
    });
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
