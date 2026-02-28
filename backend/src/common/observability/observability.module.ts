import { Module, Global } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { CircuitBreakerService } from '../resilience/circuit-breaker.service';
import { TenantRateLimitService } from '../rate-limit/tenant-rate-limit.service';
import { RedisModule } from '../redis/redis.module';
import { AlertsService } from './alerts.service';

@Global()
@Module({
  imports: [RedisModule],
  providers: [
    MetricsService,
    AlertsService,
    CircuitBreakerService,
    TenantRateLimitService,
  ],
  exports: [
    MetricsService,
    AlertsService,
    CircuitBreakerService,
    TenantRateLimitService,
  ],
})
export class ObservabilityModule {}
