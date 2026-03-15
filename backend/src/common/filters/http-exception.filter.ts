import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { captureException } from '../monitoring/sentry';

interface ExceptionResponse {
  message?: string | string[];
  error?: string;
  details?: unknown;
  errors?: unknown;
}

interface AuthenticatedRequest extends Request {
  requestId?: string;
  user?: {
    id?: string;
    userId?: string;
    [key: string]: unknown;
  };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const isProduction = process.env.NODE_ENV === 'production';
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<AuthenticatedRequest>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Erro interno do servidor';
    let code = 'INTERNAL_SERVER_ERROR';
    let details: unknown = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse() as ExceptionResponse;

      if (typeof exceptionResponse === 'object') {
        message = exceptionResponse.message || exception.message;
        code = exceptionResponse.error || exception.name;
        details = exceptionResponse.details ?? exceptionResponse.errors;
      } else {
        message = exceptionResponse as string;
      }

      // Sanitização em produção: para 5xx, não expor mensagens internas ao client.
      if (isProduction && status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        message = 'Erro interno do servidor';
        details = undefined;
      }
    } else if (exception instanceof QueryFailedError) {
      status = HttpStatus.BAD_REQUEST;
      message = 'Erro ao processar consulta no banco de dados';
      code = 'DATABASE_ERROR';

      // Erros comuns do PostgreSQL
      const dbError = exception as Error & { code?: string };
      if (dbError.code === '23505') {
        message = 'Registro duplicado';
        code = 'DUPLICATE_ENTRY';
      } else if (dbError.code === '23503') {
        message = 'Violação de chave estrangeira';
        code = 'FOREIGN_KEY_VIOLATION';
      }
    } else if (exception instanceof Error) {
      // Em produção, evitar vazar mensagens internas (stack traces, libs, infra, SQL, etc.).
      message = isProduction ? 'Erro interno do servidor' : exception.message;
      code = exception.name;
    }

    const errorResponse = {
      success: false,
      error: {
        code,
        message,
        details,
        timestamp: new Date().toISOString(),
        path: request.url,
        requestId: request.requestId,
      },
    };

    // Rotas de browser/crawler sem rota registrada — ignorar completamente
    const SILENT_PATHS = [
      '/favicon.ico',
      '/robots.txt',
      '/apple-touch-icon.png',
    ];
    if (SILENT_PATHS.includes(request.url) && status === HttpStatus.NOT_FOUND) {
      response.status(status).json(errorResponse);
      return;
    }

    // Log proporcional à gravidade: 4xx → warn, 5xx → error
    const user = request.user;
    const logMeta = {
      ...errorResponse.error,
      method: request.method,
      userId: user?.id || user?.userId,
      stack: exception instanceof Error ? exception.stack : undefined,
    };

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(logMeta);
    } else {
      this.logger.warn(logMeta);
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      captureException(exception, {
        tags: {
          requestId: request.requestId || 'unknown',
          method: request.method,
          path: request.url,
        },
        extra: {
          userId: user?.id || user?.userId,
          code,
        },
      });
    }

    response.status(status).json(errorResponse);
  }
}
