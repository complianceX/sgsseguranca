import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { MetricsService } from '../observability/metrics.service';

export type QuotaResource = 'pdf' | 'mail';

@Injectable()
export class TenantQuotaService {
  private readonly logger = new Logger(TenantQuotaService.name);

  // Atomic semaphore implemented in Redis via Lua scripts.
  private readonly acquireScript = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local ttlSeconds = tonumber(ARGV[2])

local current = redis.call('INCR', key)
if current == 1 then
  redis.call('EXPIRE', key, ttlSeconds)
else
  -- refresh TTL to avoid leaks on long jobs / worker restarts
  redis.call('EXPIRE', key, ttlSeconds)
end

if current > limit then
  redis.call('DECR', key)
  return 0
end
return current
`;

  private readonly releaseScript = `
local key = KEYS[1]
local current = tonumber(redis.call('DECR', key))
if not current or current <= 0 then
  redis.call('DEL', key)
  return 0
end
return current
`;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly metricsService: MetricsService,
  ) {}

  async tryAcquire(resource: QuotaResource, companyId?: string | null): Promise<{
    acquired: boolean;
    key?: string;
    limit?: number;
  }> {
    const cid = String(companyId || '').trim();
    if (!cid) return { acquired: true };

    const limit = this.getLimit(resource);
    if (limit <= 0) return { acquired: true };

    const ttlSeconds = this.getTtlSeconds(resource);
    const key = this.getKey(resource, cid);

    const client = this.redisService.getClient();
    const result = await client.eval(
      this.acquireScript,
      1,
      key,
      String(limit),
      String(ttlSeconds),
    );

    const acquired = Number(result) > 0;
    if (!acquired) {
      this.logger.warn({
        event: 'tenant_quota_blocked',
        resource,
        companyId: cid,
        limit,
      });
      this.metricsService.recordQuotaHit(resource, cid);
    }

    return { acquired, key, limit };
  }

  async release(resource: QuotaResource, companyId?: string | null): Promise<void> {
    const cid = String(companyId || '').trim();
    if (!cid) return;
    const limit = this.getLimit(resource);
    if (limit <= 0) return;

    const key = this.getKey(resource, cid);
    const client = this.redisService.getClient();
    await client.eval(this.releaseScript, 1, key);
  }

  getDelayMs(resource: QuotaResource): number {
    const base =
      this.getNumberEnv(`WORKER_TENANT_QUOTA_${resource.toUpperCase()}_DELAY_MS`) ??
      this.getNumberEnv('WORKER_TENANT_QUOTA_DELAY_MS') ??
      (resource === 'pdf' ? 10_000 : 5_000);
    const jitterMs = this.getJitterMs(resource);
    const jitter = jitterMs > 0 ? Math.floor(Math.random() * jitterMs) : 0;
    return Math.max(1000, Math.floor(base + jitter));
  }

  private getKey(resource: QuotaResource, companyId: string): string {
    return `tenant_quota:${resource}:${companyId}`;
  }

  private getLimit(resource: QuotaResource): number {
    const raw =
      this.getNumberEnv(
        `WORKER_TENANT_QUOTA_${resource.toUpperCase()}_MAX_ACTIVE`,
      ) ?? (resource === 'pdf' ? 1 : 3);
    return Math.max(0, Math.floor(raw));
  }

  private getTtlSeconds(resource: QuotaResource): number {
    const raw =
      this.getNumberEnv(
        `WORKER_TENANT_QUOTA_${resource.toUpperCase()}_TTL_SECONDS`,
      ) ??
      this.getNumberEnv('WORKER_TENANT_QUOTA_TTL_SECONDS') ??
      (resource === 'pdf' ? 120 : 60);
    return Math.max(10, Math.floor(raw));
  }

  private getJitterMs(resource: QuotaResource): number {
    const raw =
      this.getNumberEnv(
        `WORKER_TENANT_QUOTA_${resource.toUpperCase()}_JITTER_MS`,
      ) ??
      this.getNumberEnv('WORKER_TENANT_QUOTA_JITTER_MS') ??
      2000;
    return Math.max(0, Math.floor(raw));
  }

  private getNumberEnv(name: string): number | null {
    const raw = this.configService.get<string>(name);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  }
}
