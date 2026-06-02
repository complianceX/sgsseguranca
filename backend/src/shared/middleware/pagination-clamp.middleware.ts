import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === 'string' ? Number(value) : Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

/**
 * Clamp global de paginação.
 *
 * Objetivo: evitar paginações abusivas/exploráveis (ex: ?limit=100000) que
 * derrubam Postgres/Node sob carga. Faz a menor intervenção possível:
 * - Só mexe em `page` e `limit` quando são numéricos.
 * - Só aplica em requests GET.
 *
 * Overrides:
 * - `PAGINATION_LIMIT_MAX` (default 100)
 * - `PAGINATION_PAGE_MAX`  (default 10000)
 */
@Injectable()
export class PaginationClampMiddleware implements NestMiddleware {
  private readonly limitMax = clampInt(
    process.env.PAGINATION_LIMIT_MAX,
    100,
    1,
    500,
  );

  private readonly pageMax = clampInt(
    process.env.PAGINATION_PAGE_MAX,
    10_000,
    1,
    1_000_000,
  );

  use(req: Request, _res: Response, next: NextFunction) {
    if (req.method !== 'GET') {
      next();
      return;
    }

    const query = req.query as Record<string, unknown>;
    if (query && typeof query === 'object') {
      if (query.limit !== undefined) {
        query.limit = String(clampInt(query.limit, 20, 1, this.limitMax));
      }
      if (query.page !== undefined) {
        query.page = String(clampInt(query.page, 1, 1, this.pageMax));
      }
    }

    next();
  }
}
