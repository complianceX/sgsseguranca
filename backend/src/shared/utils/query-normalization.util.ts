import { BadRequestException } from '@nestjs/common';

export function normalizeOptionalSearchQuery(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new BadRequestException('Parâmetro de busca inválido.');
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}
