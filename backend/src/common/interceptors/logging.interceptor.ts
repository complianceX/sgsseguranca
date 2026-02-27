import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import * as crypto from 'crypto';
import { Request, Response } from 'express';

interface RequestWithUser extends Request {
  user?: {
    userId?: string;
    company_id?: string;
  };
  requestId?: string;
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const method = request.method;
    const url = request.url;
    const body = request.body as Record<string, unknown> | null;
    const headers = request.headers;
    const ip = request.ip || '';
    const userAgent = (headers['user-agent'] as string) || '';
    const requestId = crypto.randomUUID();

    // Adicionar requestId ao request para rastreamento
    request.requestId = requestId;

    const now = Date.now();

    // Log de entrada
    this.logger.log({
      type: 'REQUEST',
      requestId,
      method,
      url,
      ip,
      userAgent,
      userId: request.user?.userId,
      companyId: request.user?.company_id,
      body: this.sanitizeBody(body as Record<string, unknown>),
    });

    return next.handle().pipe(
      tap({
        next: () => {
          const responseTime = Date.now() - now;
          const response = context.switchToHttp().getResponse<Response>();

          this.logger.log({
            type: 'RESPONSE',
            requestId,
            method,
            url,
            statusCode: response.statusCode,
            responseTime: `${responseTime}ms`,
            userId: request.user?.userId,
          });
        },
        error: (error: Error) => {
          const responseTime = Date.now() - now;

          this.logger.error({
            type: 'ERROR',
            requestId,
            method,
            url,
            responseTime: `${responseTime}ms`,
            error: error.message,
            stack: error.stack,
            userId: request.user?.userId,
          });
        },
      }),
    );
  }

  private sanitizeBody(
    body: Record<string, unknown> | null,
  ): Record<string, unknown> | null {
    if (!body) return body;

    const sanitized = { ...body };
    const sensitiveFields = ['password', 'senha', 'token', 'access_token'];

    sensitiveFields.forEach((field) => {
      if (field in sanitized) {
        sanitized[field] = '***REDACTED***';
      }
    });

    return sanitized;
  }
}
