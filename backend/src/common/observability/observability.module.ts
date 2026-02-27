import { Module, Global } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { CircuitBreakerService } from '../resilience/circuit-breaker.service';
import { TenantRateLimitService } from '../rate-limit/tenant-rate-limit.service';
import { RedisModule } from '../redis/redis.module';

@Global()
@Module({
  imports: [RedisModule],
  providers: [MetricsService, CircuitBreakerService, TenantRateLimitService],
  exports: [MetricsService, CircuitBreakerService, TenantRateLimitService],
})
export class ObservabilityModule {}
