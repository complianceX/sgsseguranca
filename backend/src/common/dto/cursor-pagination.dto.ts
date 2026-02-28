import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO para paginação por cursor.
 *
 * No controller, receba via @Query():
 * ```typescript
 * @Get()
 * list(@Query() query: CursorPaginationDto, @Request() req) {
 *   return this.service.listWithCursor(req.user.company_id, query);
 * }
 * ```
 *
 * Resposta esperada:
 * ```json
 * {
 *   "data": [...],
 *   "nextCursor": "eyJpZCI6IjEyMy4uLiJ9",
 *   "hasMore": true,
 *   "count": 20
 * }
 * ```
 * O cliente usa `nextCursor` na próxima request como `?cursor=eyJpZCI6IjEyMy4uLiJ9`.
 * Quando `hasMore = false`, não há mais páginas.
 */
export class CursorPaginationDto {
  /**
   * Cursor opaco retornado pela página anterior.
   * Omitir para buscar a primeira página.
   */
  @IsOptional()
  @IsString()
  cursor?: string;

  /**
   * Número de itens por página.
   * Mínimo: 1 | Máximo: 100 | Padrão: 20
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
