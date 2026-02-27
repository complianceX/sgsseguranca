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

@Injectable()
export class StructuredLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(StructuredLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url, ip } = request;
    const startTime = Date.now();
    const requestId = request.headers['x-request-id'] || 'unknown';

    return next.handle().pipe(
      tap((response) => {
        const duration = Date.now() - startTime;
        const statusCode = context.switchToHttp().getResponse().statusCode;

        this.logger.log(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            requestId,
            method,
            url,
            statusCode,
            duration: `${duration}ms`,
            ip,
            type: 'HTTP_REQUEST',
          }),
        );
      }),
      catchError((error) => {
        const duration = Date.now() - startTime;

        this.logger.error(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            requestId,
            method,
            url,
            duration: `${duration}ms`,
            ip,
            error: error.message,
            stack: error.stack,
            type: 'HTTP_ERROR',
          }),
        );

        throw error;
      }),
    );
  }
}
