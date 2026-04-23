import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AprMetricsService } from '../services/apr-metrics.service';
import { AprMetricEventType } from '../entities/apr-metric.entity';
import { TenantService } from '../../common/tenant/tenant.service';

@Injectable()
export class AprMetricsInterceptor implements NestInterceptor {
  constructor(private readonly aprMetricsService: AprMetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      method: string;
      params?: { id?: string };
    }>();
    const aprId = request.params?.id;
    const isGetById = request.method === 'GET' && !!aprId;

    if (!isGetById) {
      return next.handle();
    }

    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const durationMs = Date.now() - start;
        const tenantId = TenantService.currentTenantId() ?? null;
        this.aprMetricsService.record({
          aprId: aprId,
          tenantId,
          eventType: AprMetricEventType.APR_OPENED,
          durationMs,
        });
      }),
    );
  }
}
