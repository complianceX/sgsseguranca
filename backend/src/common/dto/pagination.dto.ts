import {
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsString,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO padrão para paginação
 * Garante consistência em todos os endpoints que retornam listas
 */
export class PaginationDto {
  @ApiPropertyOptional({
    description: 'Número da página (começa em 1)',
    example: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Quantidade de itens por página',
    example: 10,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({
    description: 'Campo para ordenação',
    example: 'created_at',
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({
    description: 'Direção da ordenação (asc ou desc)',
    example: 'desc',
    enum: ['asc', 'desc'],
  })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional({
    description: 'Termo de busca',
    example: 'João',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description:
      'Filtro opcional por empresa para endpoints multi-tenant administrados',
    example: '11111111-1111-4111-8111-111111111111',
  })
  @IsOptional()
  @IsUUID('4', { message: 'ID de empresa inválido' })
  company_id?: string;

  /**
   * Calcular offset para banco de dados
   */
  getOffset(): number {
    return ((this.page || 1) - 1) * (this.limit || 10);
  }

  /**
   * Obter limit
   */
  getLimit(): number {
    return this.limit || 10;
  }
}

/**
 * Resposta paginada padrão
 */
export class PaginatedResponse<T> {
  items: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    pages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };

  constructor(items: T[], total: number, page: number, limit: number) {
    this.items = items;
    const pages = Math.ceil(total / limit);
    this.meta = {
      total,
      page,
      limit,
      pages,
      hasNextPage: page < pages,
      hasPreviousPage: page > 1,
    };
  }
}
