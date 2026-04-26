import { BadRequestException } from '@nestjs/common';

/**
 * Cursor (keyset) pagination helpers.
 *
 * Por que cursor pagination:
 *   OFFSET pagination escala O(N): para a página 1000 com limit 10, o Postgres
 *   percorre 10.000 linhas antes de retornar 10. Em tabelas com milhões de
 *   registros (activities, mail_logs, ai_interactions) isso fica inviável.
 *
 *   Cursor pagination usa o índice composto (created_at DESC, id DESC) para
 *   navegar em O(log N), independente da profundidade da página.
 *
 * Uso típico:
 *   const cursor = decodeCursor(query.cursor);
 *   const qb = repo.createQueryBuilder('row')
 *     .where('row.company_id = :companyId', { companyId });
 *   applyCursorWhere(qb, cursor, { alias: 'row', desc: true });
 *   qb.orderBy('row.created_at', 'DESC').addOrderBy('row.id', 'DESC')
 *     .take(limit + 1);
 *   const rows = await qb.getMany();
 *   return buildCursorPage(rows, limit, (row) => ({
 *     created_at: row.created_at,
 *     id: row.id,
 *   }));
 */

import type { SelectQueryBuilder } from 'typeorm';

export interface CursorKey {
  created_at: Date | string;
  id: string;
}

export interface CursorPage<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

const CURSOR_VERSION = 'v1';

/**
 * Encodes a cursor key as opaque base64url. Includes a version prefix so we can
 * change the schema later without breaking clients holding stale cursors
 * (decode will reject the old format with a clear error).
 */
export function encodeCursor(key: CursorKey): string {
  const createdAtIso =
    key.created_at instanceof Date
      ? key.created_at.toISOString()
      : String(key.created_at);
  const payload = JSON.stringify({
    v: CURSOR_VERSION,
    c: createdAtIso,
    i: key.id,
  });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

/**
 * Decodes a base64url cursor. Returns null if input is empty/missing.
 * Throws BadRequestException for malformed or version-mismatched cursors,
 * which surfaces as 400 instead of a confusing 500.
 */
export function decodeCursor(raw: unknown): CursorKey | null {
  if (raw === undefined || raw === null || raw === '') {
    return null;
  }
  if (typeof raw !== 'string') {
    throw new BadRequestException('Cursor inválido.');
  }

  let payload: { v?: string; c?: string; i?: string };
  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    payload = JSON.parse(decoded) as typeof payload;
  } catch {
    throw new BadRequestException('Cursor malformado.');
  }

  if (payload.v !== CURSOR_VERSION) {
    throw new BadRequestException(
      'Cursor de versão incompatível. Reinicie a paginação sem cursor.',
    );
  }
  if (typeof payload.c !== 'string' || typeof payload.i !== 'string') {
    throw new BadRequestException('Cursor com campos ausentes.');
  }

  const date = new Date(payload.c);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('Cursor com timestamp inválido.');
  }

  return { created_at: date, id: payload.i };
}

interface ApplyCursorOptions {
  alias: string;
  /** true for ORDER BY created_at DESC; false for ASC. Default: true (DESC). */
  desc?: boolean;
  /** Override field names if the entity uses different column identifiers. */
  fields?: { createdAt?: string; id?: string };
}

/**
 * Adds the WHERE clause that implements keyset pagination on top of an
 * existing QueryBuilder. Skips entirely when cursor is null (first page).
 *
 * For DESC: WHERE (created_at, id) < (cursor.created_at, cursor.id)
 * For ASC:  WHERE (created_at, id) > (cursor.created_at, cursor.id)
 *
 * Uses row-value comparison which Postgres can satisfy with a single index
 * scan when the supporting composite index exists.
 */
export function applyCursorWhere<T extends object>(
  qb: SelectQueryBuilder<T>,
  cursor: CursorKey | null,
  options: ApplyCursorOptions,
): SelectQueryBuilder<T> {
  if (!cursor) return qb;

  const createdAtField = options.fields?.createdAt ?? 'created_at';
  const idField = options.fields?.id ?? 'id';
  const op = options.desc === false ? '>' : '<';
  const alias = options.alias;

  qb.andWhere(
    `("${alias}"."${createdAtField}", "${alias}"."${idField}") ${op} (:__cursorCreatedAt, :__cursorId)`,
    {
      __cursorCreatedAt:
        cursor.created_at instanceof Date
          ? cursor.created_at.toISOString()
          : cursor.created_at,
      __cursorId: cursor.id,
    },
  );
  return qb;
}

/**
 * Slices a `take + 1` result set into the page payload. Caller must have
 * fetched limit+1 rows so we can detect hasMore without a separate COUNT(*),
 * which is the whole point of cursor pagination.
 */
export function buildCursorPage<T>(
  rows: T[],
  limit: number,
  selectKey: (row: T) => CursorKey,
): CursorPage<T> {
  if (limit <= 0) {
    return { data: [], nextCursor: null, hasMore: false };
  }

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const last = data[data.length - 1];
  const nextCursor =
    hasMore && last !== undefined ? encodeCursor(selectKey(last)) : null;

  return { data, nextCursor, hasMore };
}

/**
 * Clamps the requested limit. Always reject limits >100 to prevent abusive
 * queries (the global PaginationClampMiddleware enforces this for query strings,
 * but services that build their own pagination should call this too).
 */
export function clampCursorLimit(
  requested: number | undefined,
  defaultLimit = 20,
  maxLimit = 100,
): number {
  if (!Number.isFinite(requested)) return defaultLimit;
  const truncated = Math.trunc(Number(requested));
  if (truncated <= 0) return defaultLimit;
  return Math.min(truncated, maxLimit);
}
