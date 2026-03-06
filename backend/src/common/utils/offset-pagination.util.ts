export type OffsetPage<T> = {
  data: T[];
  total: number;
  page: number;
  lastPage: number;
};

export type OffsetPaginationInput = {
  page?: number;
  limit?: number;
};

export type NormalizedOffsetPagination = {
  page: number;
  limit: number;
  skip: number;
};

export function normalizeOffsetPagination(
  input?: OffsetPaginationInput,
  opts?: { defaultLimit?: number; maxLimit?: number },
): NormalizedOffsetPagination {
  const defaultLimit = opts?.defaultLimit ?? 20;
  const maxLimit = opts?.maxLimit ?? 100;

  let page = Number(input?.page ?? 1);
  if (!Number.isFinite(page) || page < 1) page = 1;

  let limit = Number(input?.limit ?? defaultLimit);
  if (!Number.isFinite(limit) || limit < 1) limit = defaultLimit;
  if (limit > maxLimit) limit = maxLimit;

  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

export function toOffsetPage<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): OffsetPage<T> {
  const lastPage = Math.max(1, Math.ceil(total / limit));
  return { data, total, page, lastPage };
}
