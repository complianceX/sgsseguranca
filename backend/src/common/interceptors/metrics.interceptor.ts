import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize, tap } from 'rxjs/operators';
import { MetricsService } from '../observability/metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const startTime = Date.now();

    const method = request.method;
    const routePath =
      typeof request.baseUrl === 'string' && request.route?.path
        ? `${request.baseUrl}${request.route.path}`
        : request.route?.path || request.path || request.url;
    const path = typeof routePath === 'string' ? routePath.split('?')[0] : '';

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
          );
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          const statusCode = response.statusCode || 500;
          this.metricsService.recordHttpRequest(
            method,
            path,
            statusCode,
            duration,
          );
        },
      }),
      finalize(() => {
        this.metricsService.decrementHttpRequestsInFlight();
      }),
    );
  }
}
