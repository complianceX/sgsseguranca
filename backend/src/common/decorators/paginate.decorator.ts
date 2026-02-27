import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

/**
 * Decorator para extrair parâmetros de paginação da query string
 *
 * @example
 * async findAll(@Paginate() pagination: PaginationParams) {
 *   return this.service.findAll(pagination);
 * }
 */
export const Paginate = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): PaginationParams => {
    const request = ctx.switchToHttp().getRequest();
    const query = request.query;

    // Parse page (default: 1, min: 1)
    let page = parseInt(query.page) || 1;
    if (page < 1) page = 1;

    // Parse limit (default: 50, min: 1, max: 100)
    let limit = parseInt(query.limit) || 50;
    if (limit < 1) limit = 1;
    if (limit > 100) limit = 100; // Nunca retornar mais que 100 itens

    // Calculate skip
    const skip = (page - 1) * limit;

    return { page, limit, skip };
  },
);

/**
 * Helper para criar resposta paginada
 */
export function createPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResult<T> {
  const totalPages = Math.ceil(total / limit);

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}
