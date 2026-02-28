import { Module, Global } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { CircuitBreakerService } from '../resilience/circuit-breaker.service';
import { IntegrationResilienceService } from '../resilience/integration-resilience.service';
import { RetryService } from '../resilience/retry.service';
import { TenantRateLimitService } from '../rate-limit/tenant-rate-limit.service';
import { RedisModule } from '../redis/redis.module';
import { AlertsService } from './alerts.service';
import { TenantQuotaService } from '../queue/tenant-quota.service';

@Global()
@Module({
  imports: [RedisModule],
  providers: [
    MetricsService,
    AlertsService,
    CircuitBreakerService,
    RetryService,
    IntegrationResilienceService,
    TenantQuotaService,
    TenantRateLimitService,
  ],
  exports: [
    MetricsService,
    AlertsService,
    CircuitBreakerService,
    RetryService,
    IntegrationResilienceService,
    TenantQuotaService,
    TenantRateLimitService,
  ],
})
export class ObservabilityModule {}
