import { Module, Global } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { CircuitBreakerService } from '../resilience/circuit-breaker.service';
import { IntegrationResilienceService } from '../resilience/integration-resilience.service';
import { RetryService } from '../resilience/retry.service';
import { OpenAiCircuitBreakerService } from '../resilience/openai-circuit-breaker.service';
import { TenantRateLimitService } from '../rate-limit/tenant-rate-limit.service';
import { UserRateLimitService } from '../rate-limit/user-rate-limit.service';
import { RedisModule } from '../redis/redis.module';
import { AlertsService } from './alerts.service';
import { TenantQuotaService } from '../queue/tenant-quota.service';
import { MetricsRegistryService } from './metrics-registry.service';
import { BusinessMetricsRefreshService } from './business-metrics-refresh.service';
import { BusinessMetricsSummaryService } from './business-metrics-summary.service';

@Global()
@Module({
  imports: [RedisModule],
  providers: [
    MetricsService,
    MetricsRegistryService,
    AlertsService,
    BusinessMetricsRefreshService,
    BusinessMetricsSummaryService,
    CircuitBreakerService,
    RetryService,
    OpenAiCircuitBreakerService,
    IntegrationResilienceService,
    TenantQuotaService,
    TenantRateLimitService,
    UserRateLimitService,
  ],
  exports: [
    MetricsService,
    MetricsRegistryService,
    AlertsService,
    BusinessMetricsRefreshService,
    BusinessMetricsSummaryService,
    CircuitBreakerService,
    RetryService,
    OpenAiCircuitBreakerService,
    IntegrationResilienceService,
    TenantQuotaService,
    TenantRateLimitService,
    UserRateLimitService,
  ],
})
export class ObservabilityModule {}
