import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';
import { RedisService } from './common/redis/redis.service';
import { WorkerHeartbeatService } from './common/redis/worker-heartbeat.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
    private readonly workerHeartbeatService: WorkerHeartbeatService,
  ) {}

  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Public()
  @Get('health/public')
  publicHealthCheck() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  @Public()
  @Get('health')
  async healthCheck() {
    const database = await this.checkDatabase();
    const redis = await this.checkRedis();
    const migrations = await this.checkMigrations();
    const worker = await this.workerHeartbeatService.getStatus();

    const ready =
      database.status === 'up' &&
      redis.status !== 'down' &&
      migrations.status !== 'down' &&
      (!worker.required || worker.status !== 'down');

    const payload = {
      status: ready ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: {
        database,
        redis,
        migrations,
        worker,
      },
    };

    if (!ready) {
      throw new ServiceUnavailableException(payload);
    }

    return payload;
  }

  @Public()
  @Get('api')
  apiInfo() {
    return {
      success: true,
      name: 'Wanderson Gandra API',
      version: '2.0.0',
      status: 'online',
      timestamp: new Date().toISOString(),
      endpoints: {
        health: '/health',
        healthPublic: '/health/public',
        docs: '/api/docs (apenas em desenvolvimento)',
        auth: '/auth/*',
        mail: '/mail/*',
        checklists: '/checklists/*',
        pts: '/pts/*',
        aprs: '/aprs/*',
        users: '/users/*',
        companies: '/companies/*',
      },
      message: '✅ Backend funcionando corretamente!',
    };
  }

  private async checkDatabase() {
    if (!this.dataSource.isInitialized) {
      return {
        status: 'down' as const,
        message: 'DataSource ainda não inicializado',
      };
    }

    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'up' as const };
    } catch (error) {
      return {
        status: 'down' as const,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async checkRedis() {
    const redisDisabled = /^true$/i.test(
      this.configService.get<string>('REDIS_DISABLED', 'false'),
    );

    if (redisDisabled) {
      return {
        status: 'disabled' as const,
        message: 'REDIS_DISABLED=true',
      };
    }

    try {
      const response = await this.redisService.getClient().ping();
      return {
        status: response === 'PONG' ? ('up' as const) : ('down' as const),
        message: response,
      };
    } catch (error) {
      return {
        status: 'down' as const,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async checkMigrations() {
    const requireNoPendingMigrations =
      this.configService.get<string>('REQUIRE_NO_PENDING_MIGRATIONS') ===
      'true';

    if (!requireNoPendingMigrations) {
      return { status: 'skipped' as const };
    }

    if (!this.dataSource.isInitialized) {
      return {
        status: 'down' as const,
        message: 'DataSource indisponível para verificar migrations',
      };
    }

    try {
      const hasPendingMigrations = await this.dataSource.showMigrations();
      if (hasPendingMigrations) {
        return {
          status: 'down' as const,
          message: 'Pending database migrations detected',
        };
      }

      return { status: 'up' as const };
    } catch (error) {
      return {
        status: 'down' as const,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
