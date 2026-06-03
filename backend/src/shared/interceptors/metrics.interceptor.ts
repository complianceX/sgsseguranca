import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { finalize, tap } from 'rxjs/operators';
import { MetricsService } from '../observability/metrics.service';

type RequestWithTrace = Request & {
  traceId?: string;
  sentryTraceId?: string;
};

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithTrace>();
    const response = http.getResponse<Response>();
    const startTime = Date.now();
    const route = request.route as { path?: string } | undefined;

    const method = request.method;
    const routePath =
      typeof request.baseUrl === 'string' && typeof route?.path === 'string'
        ? `${request.baseUrl}${route.path}`
        : (route?.path ?? request.path ?? request.url);
    const path = typeof routePath === 'string' ? routePath.split('?')[0] : '';
    const traceId = request.traceId || request.sentryTraceId;

    this.metricsService.incrementHttpRequestsInFlight();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          const statusCode = response.statusCode;
          this.metricsService.recordHttpRequest(
            method,
            path,
            statusCode,
            duration,
            undefined,
            traceId,
          );
        },
        error: (_error) => {
          const duration = Date.now() - startTime;
          const statusCode = response.statusCode || 500;
          this.metricsService.recordHttpRequest(
            method,
            path,
            statusCode,
            duration,
            undefined,
            traceId,
          );
        },
      }),
      finalize(() => {
        this.metricsService.decrementHttpRequestsInFlight();
      }),
    );
  }
}
