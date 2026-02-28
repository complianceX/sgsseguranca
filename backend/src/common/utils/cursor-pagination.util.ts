import { SelectQueryBuilder } from 'typeorm';

/**
 * Utilitário de paginação por cursor (keyset pagination).
 *
 * POR QUE NÃO OFFSET?
 *   OFFSET N força o PostgreSQL a ler e descartar N linhas antes de retornar
 *   os resultados. Com 100k registros, OFFSET 50000 é uma operação O(N).
 *   Com cursor, o banco usa o índice composto (company_id, created_at, id)
 *   e pula diretamente para o ponto certo — O(log N), constante na prática.
 *
 * COMO FUNCIONA:
 *   - O cursor é o "ponteiro" para o último item da página anterior.
 *   - Codificado em base64 para ser opaco ao cliente (não exponha created_at
 *     ou id diretamente na URL).
 *   - A query usa row-value comparison: (created_at, id) < (:date, :id)
 *     que é suportado nativamente pelo PostgreSQL e usa o índice composto.
 *
 * ÍNDICE NECESSÁRIO (já criado na migration 023):
 *   CREATE INDEX idx_{table}_company_created ON {table} (company_id, created_at DESC);
 *
 * USO TÍPICO:
 * ```typescript
 * const qb = this.repo.createQueryBuilder('apr')
 *   .where('apr.company_id = :companyId', { companyId });
 *
 * const { data, nextCursor, hasMore } = await paginateWithCursor(qb, 'apr', {
 *   cursor: dto.cursor,
 *   limit: dto.limit,
 * });
 * ```
 */

export interface CursorPayload {
  id: string;
  created_at: string; // ISO 8601
}

export interface CursorPage<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
  count: number;
}

/** Codifica o cursor em base64 (opaco para o cliente). */
export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

/** Decodifica o cursor recebido do cliente. Retorna null se inválido. */
export function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'id' in parsed &&
      'created_at' in parsed
    ) {
      return parsed as CursorPayload;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Aplica paginação por cursor em um QueryBuilder já filtrado.
 *
 * @param qb     QueryBuilder com filtros de negócio já aplicados (sem ORDER/LIMIT)
 * @param alias  Alias da entidade principal no QueryBuilder
 * @param opts   { cursor?, limit? }
 */
export async function paginateWithCursor<
  T extends { id: string; created_at: Date },
>(
  qb: SelectQueryBuilder<T>,
  alias: string,
  opts: { cursor?: string; limit?: number },
): Promise<CursorPage<T>> {
  const limit = Math.min(opts.limit ?? 20, 100);

  if (opts.cursor) {
    const payload = decodeCursor(opts.cursor);
    if (payload) {
      // Row-value comparison — usa o índice composto (company_id, created_at, id)
      // sem precisar de sub-queries ou offset.
      qb.andWhere(
        `(${alias}.created_at, ${alias}.id) < (:cursor_date::timestamptz, :cursor_id::uuid)`,
        { cursor_date: payload.created_at, cursor_id: payload.id },
      );
    }
  }

  // Pegamos limit+1 para saber se há próxima página sem COUNT(*) extra.
  const rows = await qb
    .orderBy(`${alias}.created_at`, 'DESC')
    .addOrderBy(`${alias}.id`, 'DESC')
    .take(limit + 1)
    .getMany();

  const hasMore = rows.length > limit;
  const data = (hasMore ? rows.slice(0, -1) : rows) as T[];

  const last = data[data.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor({
          id: last.id,
          created_at: last.created_at.toISOString(),
        })
      : null;

  return { data, nextCursor, hasMore, count: data.length };
}
