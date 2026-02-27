import { Controller, Get, Inject } from '@nestjs/common';
import {
  HealthCheckService,
  HealthCheck,
  TypeOrmHealthIndicator,
  MemoryHealthIndicator,
  DiskHealthIndicator,
} from '@nestjs/terminus';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PuppeteerPoolService } from '../common/services/puppeteer-pool.service';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    private memory: MemoryHealthIndicator,
    private disk: DiskHealthIndicator,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly puppeteerPool: PuppeteerPoolService,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      // Database
      () => this.db.pingCheck('database'),

      // Redis (custom)
      async () => {
        try {
          // Tenta acessar o cliente nativo do Redis
          const store = (
            this.cacheManager as unknown as {
              store: {
                client?: { ping: () => Promise<void> };
                getClient?: () => { ping: () => Promise<void> };
              };
            }
          ).store;
          let isHealthy = false;

          if (store.client && typeof store.client.ping === 'function') {
            await store.client.ping();
            isHealthy = true;
          } else if (typeof store.getClient === 'function') {
            const client = store.getClient();
            if (client && typeof client.ping === 'function') {
              await client.ping();
              isHealthy = true;
            }
          } else {
            // Fallback: operação simples de set/get
            await this.cacheManager.set('health-check', 'ok', 1000);
            const val = await this.cacheManager.get('health-check');
            isHealthy = val === 'ok';
          }

          return {
            redis: {
              status: isHealthy ? 'up' : 'down',
            },
          };
        } catch (error) {
          return {
            redis: {
              status: 'down',
              message: error instanceof Error ? error.message : String(error),
            },
          };
        }
      },

      // Memory (< 300MB)
      () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024),

      // Disk (< 90%)
      () =>
        this.disk.checkStorage('storage', {
          path: '/',
          thresholdPercent: 0.9,
        }),
    ]);
  }

  @Get('ready')
  ready() {
    // Kubernetes readiness probe
    return { status: 'ready' };
  }

  @Get('live')
  live() {
    // Kubernetes liveness probe
    return { status: 'alive' };
  }

  @Get('puppeteer')
  puppeteer() {
    try {
      const stats = this.puppeteerPool.getPoolStats();
      const ready = stats.total > 0 && stats.available > 0 && stats.inUse >= 0;
      return {
        status: ready ? 'up' : 'degraded',
        pool: stats,
      };
    } catch (error) {
      return {
        status: 'down',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
