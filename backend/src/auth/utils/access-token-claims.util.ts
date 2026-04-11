import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Role } from '../enums/roles.enum';

type JsonObject = Record<string, unknown>;

export interface NormalizedAccessTokenClaims {
  id: string;
  userId: string;
  app_user_id: string;
  auth_user_id?: string;
  cpf?: string;
  company_id?: string;
  companyId?: string;
  profile?: { nome: string };
  plan?: string;
  isSuperAdmin: boolean;
}

const SUPABASE_PLATFORM_ROLES = new Set([
  'authenticated',
  'anon',
  'service_role',
  'supabase_admin',
]);

function asObject(value: unknown): JsonObject | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as JsonObject;
}

function getPathValue(source: JsonObject | undefined, path: string[]): unknown {
  let current: unknown = source;
  for (const segment of path) {
    const objectValue = asObject(current);
    if (!objectValue || !(segment in objectValue)) {
      return undefined;
    }
    current = objectValue[segment];
  }
  return current;
}

function readString(
  source: JsonObject | undefined,
  ...paths: string[][]
): string | undefined {
  for (const path of paths) {
    const value = getPathValue(source, path);
    if (typeof value === 'string') {
      const normalized = value.trim();
      if (normalized) {
        return normalized;
      }
    }
  }
  return undefined;
}

function readBoolean(
  source: JsonObject | undefined,
  ...paths: string[][]
): boolean | undefined {
  for (const path of paths) {
    const value = getPathValue(source, path);
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') return true;
      if (normalized === 'false') return false;
    }
  }
  return undefined;
}

function readProfileName(source: JsonObject | undefined): string | undefined {
  const directProfile = getPathValue(source, ['profile']);
  if (typeof directProfile === 'string' && directProfile.trim()) {
    return directProfile.trim();
  }

  const directProfileObject = asObject(directProfile);
  const directProfileName = readString(directProfileObject, ['nome'], ['name']);
  if (directProfileName) {
    return directProfileName;
  }

  return readString(
    source,
    ['profile_name'],
    ['profileName'],
    ['app_metadata', 'profile_name'],
    ['app_metadata', 'profileName'],
    ['user_metadata', 'profile_name'],
    ['user_metadata', 'profileName'],
    ['app_metadata', 'profile', 'nome'],
    ['app_metadata', 'profile', 'name'],
  );
}

export function decodeJwtPayloadUnsafe(
  rawToken: string,
): JsonObject | undefined {
  const segments = rawToken.split('.');
  if (segments.length < 2) {
    return undefined;
  }

  try {
    const payload = segments[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(segments[1].length / 4) * 4, '=');

    return JSON.parse(
      Buffer.from(payload, 'base64').toString('utf8'),
    ) as JsonObject;
  } catch {
    return undefined;
  }
}

export function looksLikeSupabaseAccessTokenPayload(payload: unknown): boolean {
  const claims = asObject(payload);
  if (!claims) {
    return false;
  }

  const issuer = readString(claims, ['iss']);
  if (issuer?.includes('/auth/v1')) {
    return true;
  }

  if (readString(claims, ['session_id'])) {
    return true;
  }

  if (asObject(getPathValue(claims, ['app_metadata']))) {
    return true;
  }

  if (asObject(getPathValue(claims, ['user_metadata']))) {
    return true;
  }

  const role = readString(claims, ['role']);
  return Boolean(role && SUPABASE_PLATFORM_ROLES.has(role));
}

export function resolveAccessTokenSecret(
  configService: ConfigService,
  rawToken?: string,
  payload?: unknown,
): string {
  const localSecret = configService.get<string>('JWT_SECRET')?.trim();
  if (!localSecret) {
    throw new Error('JWT_SECRET is required');
  }

  const supabaseSecret = configService
    .get<string>('SUPABASE_JWT_SECRET')
    ?.trim();
  const candidatePayload =
    payload ?? (rawToken ? decodeJwtPayloadUnsafe(rawToken) : undefined);

  if (supabaseSecret && looksLikeSupabaseAccessTokenPayload(candidatePayload)) {
    return supabaseSecret;
  }

  return localSecret;
}

export function normalizeAccessTokenClaims(
  payload: unknown,
): NormalizedAccessTokenClaims {
  const claims = asObject(payload);
  if (!claims) {
    throw new UnauthorizedException('Token inválido');
  }

  const jwtSub = readString(claims, ['sub']);
  if (!jwtSub) {
    throw new UnauthorizedException('Token inválido');
  }

  const appUserId =
    readString(
      claims,
      ['app_user_id'],
      ['app_userId'],
      ['user_id'],
      ['app_metadata', 'app_user_id'],
      ['app_metadata', 'app_userId'],
      ['app_metadata', 'user_id'],
    ) ?? jwtSub;

  const explicitSuperAdmin =
    readBoolean(
      claims,
      ['is_super_admin'],
      ['isSuperAdmin'],
      ['app_metadata', 'is_super_admin'],
      ['app_metadata', 'isSuperAdmin'],
    ) ?? false;

  const profileName = readProfileName(claims);
  const effectiveProfileName =
    profileName || (explicitSuperAdmin ? Role.ADMIN_GERAL : undefined);

  const companyId = readString(
    claims,
    ['company_id'],
    ['companyId'],
    ['tenant_id'],
    ['tenantId'],
    ['app_metadata', 'company_id'],
    ['app_metadata', 'companyId'],
    ['app_metadata', 'tenant_id'],
    ['app_metadata', 'tenantId'],
    ['user_metadata', 'company_id'],
    ['user_metadata', 'companyId'],
  );

  const authUserId =
    readString(
      claims,
      ['auth_uid'],
      ['auth_user_id'],
      ['app_metadata', 'auth_uid'],
      ['app_metadata', 'auth_user_id'],
    ) ?? (appUserId !== jwtSub ? jwtSub : undefined);

  const cpf = readString(claims, ['cpf'], ['user_metadata', 'cpf']);
  const plan = readString(
    claims,
    ['plan'],
    ['app_metadata', 'plan'],
    ['user_metadata', 'plan'],
  );

  return {
    id: appUserId,
    userId: appUserId,
    app_user_id: appUserId,
    auth_user_id: authUserId,
    cpf,
    company_id: companyId,
    companyId,
    profile: effectiveProfileName ? { nome: effectiveProfileName } : undefined,
    plan,
    isSuperAdmin:
      explicitSuperAdmin || effectiveProfileName === Role.ADMIN_GERAL,
  };
}

export function verifyAccessTokenClaims(
  jwtService: JwtService,
  configService: ConfigService,
  token: string,
): NormalizedAccessTokenClaims {
  const payload = jwtService.verify(token, {
    secret: resolveAccessTokenSecret(configService, token),
  }) as unknown;

  return normalizeAccessTokenClaims(payload);
}
