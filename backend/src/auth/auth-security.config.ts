import type { SignOptions } from 'jsonwebtoken';

// Ajustamos os padrões para "praticamente ilimitado": 10 anos.
const DEFAULT_ACCESS_TOKEN_TTL = '3650d';
const DEFAULT_REFRESH_TOKEN_TTL_DAYS = 3650; // 10 anos
const DEFAULT_MAX_ACTIVE_SESSIONS_PER_USER = 5;
type TokenExpiresIn = NonNullable<SignOptions['expiresIn']>;

export function isInfiniteTtl(ttl: TokenExpiresIn | string): boolean {
  const normalized = String(ttl).toLowerCase();
  return normalized === '0' || normalized === 'never' || normalized === 'infinite';
}

function parsePositiveInt(
  value: string | undefined,
  fallback: number,
  max: number,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(parsed), max);
}

function durationToMs(duration: string): number | null {
  const normalized = duration.trim().toLowerCase();
  const match = normalized.match(/^(\d+)(s|m|h|d)$/);
  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  const unit = match[2];
  const unitMs: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return value * unitMs[unit];
}

export function getAccessTokenTtl(): TokenExpiresIn {
  const ttl = process.env.ACCESS_TOKEN_TTL?.trim();
  return (ttl || DEFAULT_ACCESS_TOKEN_TTL) as TokenExpiresIn;
}

export function getAccessTokenCookieMaxAgeMs(): number {
  const ttl = getAccessTokenTtl();
  if (isInfiniteTtl(ttl)) {
    return 100 * 365 * 24 * 60 * 60 * 1000; // 100 anos em ms
  }
  if (typeof ttl === 'number') {
    return ttl * 1000;
  }

  const parsed = durationToMs(ttl);
  return parsed || 15 * 60 * 1000;
}

export function getRefreshTokenTtlDays(): number {
  const raw = process.env.REFRESH_TOKEN_TTL_DAYS;
  if (raw?.trim() === '0' || raw?.trim() === 'never') {
    return DEFAULT_REFRESH_TOKEN_TTL_DAYS;
  }
  return parsePositiveInt(raw, DEFAULT_REFRESH_TOKEN_TTL_DAYS, 3650);
}

export function getRefreshTokenTtl(): TokenExpiresIn {
  return `${getRefreshTokenTtlDays()}d` as TokenExpiresIn;
}

export function getRefreshTokenCookieMaxAgeMs(): number {
  return getRefreshTokenTtlDays() * 24 * 60 * 60 * 1000;
}

export function getMaxActiveSessionsPerUser(): number {
  return parsePositiveInt(
    process.env.MAX_ACTIVE_SESSIONS_PER_USER,
    DEFAULT_MAX_ACTIVE_SESSIONS_PER_USER,
    20,
  );
}
