import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../dto/error-response.dto';

export interface ApiStandardResponsesOptions {
  /**
   * Inclui 404 Not Found. Útil apenas em rotas que buscam/alteram
   * um recurso específico por id — em listagens/create é ruído.
   */
  includeNotFound?: boolean;
  /**
   * Inclui 403 Forbidden. Desligue em rotas `@Public()`.
   */
  includeForbidden?: boolean;
  /**
   * Inclui 401 Unauthorized. Desligue em rotas `@Public()`.
   */
  includeUnauthorized?: boolean;
}

/**
 * Aplica os códigos de erro padrão emitidos pela API
 * (400 validação, 401 sem token, 403 sem permissão, 429 rate limit, 500 erro).
 *
 * Todos apontam para `ErrorResponseDto`, que é a forma que o
 * `AllExceptionsFilter` produz em runtime.
 *
 * @example
 * @ApiStandardResponses({ includeNotFound: true })
 * @Get(':id')
 * findOne(@Param('id') id: string) { ... }
 */
export const ApiStandardResponses = (
  options: ApiStandardResponsesOptions = {},
) => {
  const {
    includeNotFound = false,
    includeForbidden = true,
    includeUnauthorized = true,
  } = options;

  const decorators = [
    ApiBadRequestResponse({
      description: 'Dados inválidos (falha de validação DTO).',
      type: ErrorResponseDto,
    }),
    ApiTooManyRequestsResponse({
      description:
        'Rate limit excedido (global/tenant/user). Respeite `Retry-After`.',
      type: ErrorResponseDto,
    }),
    ApiInternalServerErrorResponse({
      description: 'Erro interno. Mensagem genérica em produção.',
      type: ErrorResponseDto,
    }),
  ];

  if (includeUnauthorized) {
    decorators.push(
      ApiUnauthorizedResponse({
        description: 'Token ausente, inválido ou expirado.',
        type: ErrorResponseDto,
      }),
    );
  }

  if (includeForbidden) {
    decorators.push(
      ApiForbiddenResponse({
        description:
          'Sem permissão para o recurso (RBAC/tenant/contrato de autorização).',
        type: ErrorResponseDto,
      }),
    );
  }

  if (includeNotFound) {
    decorators.push(
      ApiNotFoundResponse({
        description: 'Recurso não encontrado.',
        type: ErrorResponseDto,
      }),
    );
  }

  return applyDecorators(...decorators);
};
