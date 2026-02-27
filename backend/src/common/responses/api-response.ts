import { HttpStatus } from '@nestjs/common';

/**
 * Resposta padrão de API
 * Garante consistência em todas as respostas
 */
export class ApiResponse<T = any> {
  success: boolean;
  statusCode: number;
  message: string;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    timestamp: string;
    requestId?: string;
    path?: string;
  };

  constructor(
    success: boolean,
    statusCode: number,
    message: string,
    data?: T,
    error?: any,
    requestId?: string,
    path?: string,
  ) {
    this.success = success;
    this.statusCode = statusCode;
    this.message = message;
    this.data = data;
    this.error = error;
    this.meta = {
      timestamp: new Date().toISOString(),
      requestId,
      path,
    };
  }

  /**
   * Criar resposta de sucesso
   */
  static success<T>(
    data: T,
    message: string = 'Operação realizada com sucesso',
    statusCode: number = HttpStatus.OK,
    requestId?: string,
    path?: string,
  ): ApiResponse<T> {
    return new ApiResponse(
      true,
      statusCode,
      message,
      data,
      undefined,
      requestId,
      path,
    );
  }

  /**
   * Criar resposta de erro
   */
  static error(
    message: string,
    code: string = 'INTERNAL_ERROR',
    statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR,
    details?: any,
    requestId?: string,
    path?: string,
  ): ApiResponse {
    return new ApiResponse(
      false,
      statusCode,
      message,
      undefined,
      { code, message, details },
      requestId,
      path,
    );
  }

  /**
   * Criar resposta de validação
   */
  static validation(
    message: string = 'Erro de validação',
    details?: any,
    requestId?: string,
    path?: string,
  ): ApiResponse {
    return new ApiResponse(
      false,
      HttpStatus.BAD_REQUEST,
      message,
      undefined,
      { code: 'VALIDATION_ERROR', message, details },
      requestId,
      path,
    );
  }

  /**
   * Criar resposta de não encontrado
   */
  static notFound(
    message: string = 'Recurso não encontrado',
    requestId?: string,
    path?: string,
  ): ApiResponse {
    return new ApiResponse(
      false,
      HttpStatus.NOT_FOUND,
      message,
      undefined,
      { code: 'NOT_FOUND', message },
      requestId,
      path,
    );
  }

  /**
   * Criar resposta de não autorizado
   */
  static unauthorized(
    message: string = 'Não autorizado',
    requestId?: string,
    path?: string,
  ): ApiResponse {
    return new ApiResponse(
      false,
      HttpStatus.UNAUTHORIZED,
      message,
      undefined,
      { code: 'UNAUTHORIZED', message },
      requestId,
      path,
    );
  }

  /**
   * Criar resposta de proibido
   */
  static forbidden(
    message: string = 'Acesso proibido',
    requestId?: string,
    path?: string,
  ): ApiResponse {
    return new ApiResponse(
      false,
      HttpStatus.FORBIDDEN,
      message,
      undefined,
      { code: 'FORBIDDEN', message },
      requestId,
      path,
    );
  }
}
