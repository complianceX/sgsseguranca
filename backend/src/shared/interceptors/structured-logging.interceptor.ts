import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request } from 'express';

type HttpResponseLike = {
  statusCode?: number;
};

type RequestWithTrace = Request & {
  traceId?: string;
  sentryTraceId?: string;
};

@Injectable()
export class StructuredLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(StructuredLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithTrace>();
    const { method, url, ip } = request;
    const startTime = Date.now();
    const requestId = request.headers['x-request-id'] || 'unknown';
    const traceId = request.traceId || request.sentryTraceId;

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - startTime;
        const response = context.switchToHttp().getResponse<HttpResponseLike>();
        const statusCode = response.statusCode ?? 200;

        this.logger.log({
          requestId,
          traceId,
          method,
          url,
          statusCode,
          responseTimeMs: duration,
          ip,
          type: 'HTTP_REQUEST',
        });
      }),
      catchError((error: unknown) => {
        const duration = Date.now() - startTime;

        this.logger.error({
          requestId,
          traceId,
          method,
          url,
          responseTimeMs: duration,
          ip,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          type: 'HTTP_ERROR',
        });

        throw error;
      }),
    );
  }
}
