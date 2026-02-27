import type { SignOptions } from 'jsonwebtoken';

const DEFAULT_ACCESS_TOKEN_TTL = '15m';
const DEFAULT_REFRESH_TOKEN_TTL_DAYS = 7;
const DEFAULT_MAX_ACTIVE_SESSIONS_PER_USER = 5;
type TokenExpiresIn = NonNullable<SignOptions['expiresIn']>;

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
  if (typeof ttl === 'number') {
    return ttl * 1000;
  }

  const parsed = durationToMs(ttl);
  return parsed || 15 * 60 * 1000;
}

export function getRefreshTokenTtlDays(): number {
  return parsePositiveInt(
    process.env.REFRESH_TOKEN_TTL_DAYS,
    DEFAULT_REFRESH_TOKEN_TTL_DAYS,
    30,
  );
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
