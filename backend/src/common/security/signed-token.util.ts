import { BadRequestException } from '@nestjs/common';

export const SIGNED_TOKEN_SHAPE_REGEX =
  /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
export const SIGNED_TOKEN_MAX_LENGTH = 4096;

export function normalizeSignedToken(value: string | null | undefined): string {
  return String(value || '').trim();
}

export function isLikelySignedToken(value: string): boolean {
  if (!value || value.length > SIGNED_TOKEN_MAX_LENGTH) {
    return false;
  }

  return SIGNED_TOKEN_SHAPE_REGEX.test(value);
}

export function assertValidSignedToken(
  rawToken: string | null | undefined,
  message = 'Token assinado inválido.',
): string {
  const normalized = normalizeSignedToken(rawToken);
  if (!isLikelySignedToken(normalized)) {
    throw new BadRequestException(message);
  }

  return normalized;
}
