import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

export type CursorTokenPayload = {
  created_at: string;
  id: string;
};

export type CursorDirection = 'desc' | 'asc';

const MAX_CURSOR_LIMIT = 100;
const DEFAULT_CURSOR_LIMIT = 20;

export function clampCursorLimit(
  raw: unknown,
  opts?: { defaultLimit?: number; maxLimit?: number },
): number {
  const defaultLimit = opts?.defaultLimit ?? DEFAULT_CURSOR_LIMIT;
  const maxLimit = opts?.maxLimit ?? MAX_CURSOR_LIMIT;

  const parsed =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string'
        ? Number.parseInt(raw, 10)
        : NaN;

  if (!Number.isFinite(parsed) || parsed < 1) {
    return defaultLimit;
  }

  return Math.min(parsed, maxLimit);
}

export type CursorPaginatedResponse<T> = {
  data: T[];
  cursor: string | null;
  hasMore: boolean;
  total?: number;
};

export function encodeCursorToken(payload: CursorTokenPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursorToken(
  token?: string | null,
): CursorTokenPayload | null {
  if (!token) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(token, 'base64url').toString('utf8'),
    ) as Partial<CursorTokenPayload>;

    if (
      !decoded ||
      typeof decoded.created_at !== 'string' ||
      typeof decoded.id !== 'string' ||
      decoded.created_at.trim().length === 0 ||
      decoded.id.trim().length === 0 ||
      Number.isNaN(new Date(decoded.created_at).getTime())
    ) {
      return null;
    }

    return {
      created_at: decoded.created_at,
      id: decoded.id,
    };
  } catch {
    return null;
  }
}

export function toCursorPaginatedResponse<T extends { id: string }>(input: {
  rows: T[];
  limit: number;
  getCreatedAt: (row: T) => Date | string | null | undefined;
  includeTotal?: number;
}): CursorPaginatedResponse<T> {
  const hasMore = input.rows.length > input.limit;
  const data = hasMore ? input.rows.slice(0, input.limit) : input.rows;
  const lastRow = data[data.length - 1];

  const cursor = lastRow
    ? encodeCursorToken({
        id: lastRow.id,
        created_at: normalizeCursorDate(input.getCreatedAt(lastRow)),
      })
    : null;

  return {
    data,
    cursor: hasMore ? cursor : null,
    hasMore,
    ...(typeof input.includeTotal === 'number'
      ? { total: input.includeTotal }
      : {}),
  };
}

function normalizeCursorDate(value: Date | string | null | undefined): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return new Date(0).toISOString();
}

/**
 * Aplica keyset pagination (created_at, id) em um QueryBuilder TypeORM.
 *
 * Para `direction = 'desc'` (default — mais recente primeiro):
 *   WHERE (created_at, id) < (:cursorCreatedAt, :cursorId)
 *   ORDER BY created_at DESC, id DESC
 *
 * Busca-se `limit + 1` registros para detectar se há próxima página sem
 * um COUNT separado (barato em datasets grandes).
 *
 * @example
 * const qb = repo.createQueryBuilder('apr')
 *   .where('apr.company_id = :companyId', { companyId });
 * applyCursorKeyset(qb, 'apr', { cursor: query.cursor, limit });
 * const rows = await qb.getMany();
 * return toCursorPaginatedResponse({ rows, limit, getCreatedAt: r => r.created_at });
 */
export function applyCursorKeyset<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: string,
  opts: {
    cursor?: string | null;
    limit: number;
    direction?: CursorDirection;
    createdAtColumn?: string;
    idColumn?: string;
  },
): SelectQueryBuilder<T> {
  const direction = opts.direction ?? 'desc';
  const createdAtColumn = opts.createdAtColumn ?? 'created_at';
  const idColumn = opts.idColumn ?? 'id';
  const comparator = direction === 'desc' ? '<' : '>';
  const orderDir = direction === 'desc' ? 'DESC' : 'ASC';

  const decoded = decodeCursorToken(opts.cursor ?? undefined);
  if (decoded) {
    qb.andWhere(
      `(${alias}.${createdAtColumn}, ${alias}.${idColumn}) ${comparator} (:__cursorCreatedAt, :__cursorId)`,
      {
        __cursorCreatedAt: decoded.created_at,
        __cursorId: decoded.id,
      },
    );
  }

  qb.orderBy(`${alias}.${createdAtColumn}`, orderDir).addOrderBy(
    `${alias}.${idColumn}`,
    orderDir,
  );

  qb.take(opts.limit + 1); // +1 para detectar hasMore sem COUNT

  return qb;
}
