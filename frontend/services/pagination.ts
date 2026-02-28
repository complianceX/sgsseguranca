export type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  lastPage: number;
};

export async function fetchAllPages<T>(opts: {
  fetchPage: (page: number, limit: number) => Promise<PaginatedResponse<T>>;
  limit?: number;
  maxPages?: number;
}): Promise<T[]> {
  const limit = opts.limit ?? 100;
  const maxPages = opts.maxPages ?? 50;

  const first = await opts.fetchPage(1, limit);
  const pages = Math.min(first.lastPage, maxPages);
  const all = [...first.data];

  for (let page = 2; page <= pages; page += 1) {
    const res = await opts.fetchPage(page, limit);
    all.push(...res.data);
  }

  return all;
}

