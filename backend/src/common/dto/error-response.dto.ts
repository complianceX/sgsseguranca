import { ApiProperty } from '@nestjs/swagger';

/**
 * Formato padronizado do corpo de erros emitido pelo
 * `AllExceptionsFilter`. Existe apenas para documentação Swagger
 * — o filter produz o objeto em runtime.
 */
export class ErrorBodyDto {
  @ApiProperty({
    description:
      'Código simbólico do erro, sempre em SNAKE_CASE. Exemplos: ' +
      '`VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, ' +
      '`TOO_MANY_REQUESTS`, `INTERNAL_SERVER_ERROR`.',
    example: 'VALIDATION_ERROR',
  })
  code!: string;

  @ApiProperty({
    description:
      'Mensagem legível. Em respostas de validação pode ser uma lista de strings.',
    oneOf: [
      { type: 'string' },
      { type: 'array', items: { type: 'string' } },
    ],
    example: 'Dados inválidos',
  })
  message!: string | string[];

  @ApiProperty({
    description: 'Detalhes auxiliares (ex.: campos inválidos por DTO).',
    required: false,
    nullable: true,
  })
  details?: unknown;

  @ApiProperty({
    description: 'Timestamp ISO 8601 do momento da falha (gerado pelo filter).',
    example: '2026-04-24T12:34:56.789Z',
  })
  timestamp!: string;

  @ApiProperty({
    description: 'Path que originou o erro.',
    example: '/v1/aprs',
  })
  path!: string;

  @ApiProperty({
    description:
      'Correlation ID da request (também exposto no header `X-Request-ID`).',
    example: 'c4b1a2e0-2f88-4b9d-bcd1-1f3e7f44a9a2',
  })
  requestId!: string;
}

export class ErrorResponseDto {
  @ApiProperty({ example: false })
  success!: false;

  @ApiProperty({ type: ErrorBodyDto })
  error!: ErrorBodyDto;
}
