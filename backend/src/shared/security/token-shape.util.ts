import { BadRequestException } from '@nestjs/common';

const BASE64URL_TOKEN_REGEX = /^[A-Za-z0-9_-]+$/;
const HEX_TOKEN_REGEX = /^[a-f0-9]+$/i;

const DEFAULT_BASE64URL_MIN_LENGTH = 32;
const DEFAULT_BASE64URL_MAX_LENGTH = 256;

export function normalizeTokenShape(value: string | null | undefined): string {
  return String(value || '').trim();
}

export function assertValidBase64UrlToken(
  rawToken: string | null | undefined,
  message = 'Token inválido.',
): string {
  const token = normalizeTokenShape(rawToken);
  if (
    token.length < DEFAULT_BASE64URL_MIN_LENGTH ||
    token.length > DEFAULT_BASE64URL_MAX_LENGTH ||
    !BASE64URL_TOKEN_REGEX.test(token)
  ) {
    throw new BadRequestException(message);
  }

  return token;
}

export function assertValidHexToken(
  rawToken: string | null | undefined,
  exactLength: number,
  message = 'Token inválido.',
): string {
  const token = normalizeTokenShape(rawToken).toLowerCase();
  if (token.length !== exactLength || !HEX_TOKEN_REGEX.test(token)) {
    throw new BadRequestException(message);
  }

  return token;
}
