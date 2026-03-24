export type CursorTokenPayload = {
  created_at: string;
  id: string;
};

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
