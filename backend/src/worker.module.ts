import { Module, Logger } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import * as Joi from 'joi';
import * as redisStore from 'cache-manager-redis-store';
import type { RedisClientOptions } from 'redis';
import { DatabaseLogger } from './common/logging/database.logger';
import { RedisModule } from './common/redis/redis.module';
import { MailWorkerModule } from './mail/mail.worker.module';
import { DocumentImportWorkerModule } from './document-import/document-import.worker.module';
import { ReportsWorkerModule } from './reports/reports.worker.module';
import { QueueServicesModule } from './queue/queue-services.module';
import { ObservabilityModule } from './common/observability/observability.module';
import { ObservabilityWorkerModule } from './common/observability/observability.worker.module';
import { SlaEscalationWorkerModule } from './sla-escalation-worker.module';
import { ExpiryNotificationsWorkerModule } from './tasks/expiry-notifications-worker.module';
import { DocumentRetentionWorkerModule } from './tasks/document-retention-worker.module';
import { RbacModule } from './rbac/rbac.module';
import { SecurityAuditModule } from './common/security/security-audit.module';
import { WorkerHeartbeatReporterService } from './common/redis/worker-heartbeat-reporter.service';
import { resolveRedisConnection } from './common/redis/redis-connection.util';
import {
  parseBooleanFlag,
  resolveDbSslOptions,
} from './common/database/db-ssl.util';
import { DashboardWorkerModule } from './dashboard/dashboard.worker.module';
import { DisasterRecoveryWorkerModule } from './disaster-recovery/disaster-recovery.worker.module';
import { TasksWorkerModule } from './tasks/tasks.worker.module';

interface RedisCacheConfig {
  store: unknown;
  host: string;
  port: number;
  password?: string;
  ttl: number;
  max: number;
  tls?: Record<string, unknown>;
}

function firstNonEmpty(
  values: Array<string | undefined | null>,
): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

function resolveDatabaseUrl(config: ConfigService): string | undefined {
  return firstNonEmpty([
    config.get<string>('DATABASE_URL'),
    config.get<string>('DATABASE_PRIVATE_URL'),
    config.get<string>('DATABASE_PUBLIC_URL'),
    config.get<string>('URL_DO_BANCO_DE_DADOS'),
  ]);
}

function normalizeDatabaseUrlForPg(url?: string): string | undefined {
  if (!url) {
    return undefined;
  }

  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('sslmode');
    return parsed.toString();
  } catch {
    return url;
  }
}

function describeDatabaseTarget(url?: string): string {
  if (!url) {
    return 'target=unknown';
  }

  try {
    const parsed = new URL(url);
    const databaseName = parsed.pathname.replace(/^\//, '') || '(default)';
    return `host=${parsed.hostname} port=${parsed.port || '5432'} db=${databaseName}`;
  } catch {
    return 'target=invalid-url';
  }
}

function resolveDatabaseHost(config: ConfigService): string | undefined {
  return firstNonEmpty([
    config.get<string>('DATABASE_HOST'),
    config.get<string>('PGHOST'),
    config.get<string>('POSTGRES_HOST'),
  ]);
}

function resolveDatabasePort(config: ConfigService): number {
  const numericCandidates = [
    config.get<number>('DATABASE_PORT'),
    config.get<number>('PGPORT'),
    config.get<number>('POSTGRES_PORT'),
  ];

  for (const candidate of numericCandidates) {
    if (
      typeof candidate === 'number' &&
      Number.isFinite(candidate) &&
      candidate > 0
    ) {
      return candidate;
    }
  }

  const raw = firstNonEmpty([
    config.get<string>('DATABASE_PORT'),
    config.get<string>('PGPORT'),
    config.get<string>('POSTGRES_PORT'),
  ]);
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5432;
}

function resolveDatabaseUser(config: ConfigService): string | undefined {
  return firstNonEmpty([
    config.get<string>('DATABASE_USER'),
    config.get<string>('PGUSER'),
    config.get<string>('POSTGRES_USER'),
  ]);
}

function resolveDatabasePassword(config: ConfigService): string | undefined {
  return firstNonEmpty([
    config.get<string>('DATABASE_PASSWORD'),
    config.get<string>('PGPASSWORD'),
    config.get<string>('POSTGRES_PASSWORD'),
  ]);
}

function resolveDatabaseName(config: ConfigService): string | undefined {
  return firstNonEmpty([
    config.get<string>('DATABASE_NAME'),
    config.get<string>('PGDATABASE'),
    config.get<string>('POSTGRES_DB'),
  ]);
}

const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test', 'staging')
    .default('development'),
  REDIS_URL: Joi.string().optional().allow(''),
  URL_REDIS: Joi.string().optional().allow(''),
  REDIS_PUBLIC_URL: Joi.string().optional().allow(''),
  REDIS_DISABLED: Joi.string().valid('true', 'false').optional().allow(''),
  REDIS_HOST: Joi.string().optional(),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().optional().allow(''),
  REDIS_TLS: Joi.boolean().default(false),
  DATABASE_URL: Joi.string().optional(),
  DATABASE_HOST: Joi.string().optional(),
  DATABASE_PORT: Joi.number().default(5432),
  DATABASE_USER: Joi.string().optional(),
  DATABASE_PASSWORD: Joi.string().optional(),
  DATABASE_NAME: Joi.string().optional(),
  DATABASE_SSL: Joi.boolean().default(false),
  DATABASE_SSL_ALLOW_INSECURE: Joi.boolean().default(false),
  DATABASE_SSL_CA: Joi.string().optional(),
  DB_POOL_MAX: Joi.number().default(5),
  DB_POOL_MIN: Joi.number().default(0),
  DB_IDLE_TIMEOUT_MS: Joi.number().default(30000),
  DB_CONNECTION_TIMEOUT_MS: Joi.number().default(10000),
  DB_APPLICATION_NAME: Joi.string().optional().allow(''),
  DB_APPLICATION_NAME_WORKER: Joi.string().optional().allow(''),
  DB_TIMINGS_ENABLED: Joi.boolean().default(false),
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly')
    .optional()
    .allow(''),
  OTEL_ENABLED: Joi.boolean().default(false),
  OTEL_SERVICE_NAME: Joi.string().optional(),
  OTEL_SERVICE_VERSION: Joi.string().optional(),
  JAEGER_ENDPOINT: Joi.string().optional(),
  PROMETHEUS_PORT: Joi.number().optional(),
  SENTRY_DSN: Joi.string().uri().optional().allow(''),
  SENTRY_ENVIRONMENT: Joi.string().optional().allow(''),
  SENTRY_TRACES_SAMPLE_RATE: Joi.number().min(0).max(1).optional(),
  NEW_RELIC_ENABLED: Joi.boolean().default(false),
  ALERTS_ENABLED: Joi.boolean().default(false),
  ALERTS_MIN_REQUESTS: Joi.number().default(20),
  ALERTS_ERROR_RATE_THRESHOLD: Joi.number().default(0.05),
  ALERTS_HTTP_AVG_LATENCY_MS_THRESHOLD: Joi.number().default(2000),
  ALERTS_POOL_USAGE_THRESHOLD: Joi.number().default(0.8),
  ALERTS_QUEUE_WAITING_THRESHOLD: Joi.number().default(20),

  // Integrações externas (timeout/retry/circuit breaker padrão)
  INTEGRATION_TIMEOUT_MS: Joi.number().default(10000),
  INTEGRATION_RETRY_ATTEMPTS: Joi.number().default(3),
  INTEGRATION_RETRY_BASE_DELAY_MS: Joi.number().default(200),
  INTEGRATION_RETRY_MAX_DELAY_MS: Joi.number().default(2000),
  INTEGRATION_RETRY_JITTER_RATIO: Joi.number().min(0).max(1).default(0.2),
  INTEGRATION_CB_FAILURE_THRESHOLD: Joi.number().default(5),
  INTEGRATION_CB_SUCCESS_THRESHOLD: Joi.number().default(2),
  INTEGRATION_CB_RESET_TIMEOUT_MS: Joi.number().default(30000),

  // S3/AWS timeouts
  S3_SOCKET_TIMEOUT_MS: Joi.number().default(10000),
  S3_CONNECTION_TIMEOUT_MS: Joi.number().default(2000),
  S3_MAX_ATTEMPTS: Joi.number().default(3),
  PDF_GENERATION_CONCURRENCY: Joi.number().integer().min(1).max(4).optional(),
  PDF_BROWSER_POOL_SIZE: Joi.number().integer().min(1).max(4).optional(),
  PDF_PAGE_TIMEOUT_MS: Joi.number().integer().min(15000).max(180000).optional(),
  PDF_BROWSER_ACQUIRE_TIMEOUT_MS: Joi.number()
    .integer()
    .min(5000)
    .max(180000)
    .optional(),
  PDF_BROWSER_MAX_USES: Joi.number().integer().min(5).max(500).optional(),
  PDF_QUEUE_JOB_TIMEOUT_MS: Joi.number()
    .integer()
    .min(60000)
    .max(900000)
    .optional(),
  DOCUMENT_IMPORT_QUEUE_TIMEOUT_MS: Joi.number()
    .integer()
    .min(30000)
    .max(900000)
    .optional(),
  DOCUMENT_IMPORT_QUEUE_ATTEMPTS: Joi.number()
    .integer()
    .min(1)
    .max(10)
    .optional(),
  DOCUMENT_IMPORT_QUEUE_CONCURRENCY: Joi.number()
    .integer()
    .min(1)
    .max(4)
    .optional(),
  INSPECTION_INLINE_EVIDENCE_MAX_BYTES: Joi.number()
    .integer()
    .min(131072)
    .max(10485760)
    .optional(),

  // Worker quota por tenant
  WORKER_TENANT_QUOTA_DELAY_MS: Joi.number().default(10000),
  WORKER_TENANT_QUOTA_TTL_SECONDS: Joi.number().default(120),
  WORKER_TENANT_QUOTA_PDF_MAX_ACTIVE: Joi.number().default(1),
  WORKER_TENANT_QUOTA_MAIL_MAX_ACTIVE: Joi.number().default(3),
  WORKER_TENANT_QUOTA_PDF_DELAY_MS: Joi.number().default(10000),
  WORKER_TENANT_QUOTA_MAIL_DELAY_MS: Joi.number().default(5000),
  WORKER_TENANT_QUOTA_PDF_TTL_SECONDS: Joi.number().default(120),
  WORKER_TENANT_QUOTA_MAIL_TTL_SECONDS: Joi.number().default(60),
  WORKER_TENANT_QUOTA_JITTER_MS: Joi.number().default(2000),
  WORKER_TENANT_QUOTA_PDF_JITTER_MS: Joi.number().default(2000),
  WORKER_TENANT_QUOTA_MAIL_JITTER_MS: Joi.number().default(2000),
  WORKER_HEARTBEAT_ENABLED: Joi.boolean().default(true),
  WORKER_HEARTBEAT_REQUIRED: Joi.boolean().default(true),
  WORKER_HEARTBEAT_KEY: Joi.string().default('worker:heartbeat:queue-runtime'),
  WORKER_HEARTBEAT_TTL_SECONDS: Joi.number().default(90),
});

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema,
      validationOptions: {
        abortEarly: false,
        allowUnknown: true,
      },
    }),
    ScheduleModule.forRoot(),
    CacheModule.registerAsync<RedisClientOptions>({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const logger = new Logger('WorkerCacheModule');
        const redisConnection = resolveRedisConnection(config);

        if (!redisConnection) {
          throw new Error(
            'Redis é obrigatório para o cache do worker. Configure REDIS_URL/URL_REDIS/REDIS_PUBLIC_URL ou REDIS_HOST.',
          );
        }

        logger.log(
          `Configurando Redis Cache do worker (${redisConnection.source})`,
        );

        const redisConfig: RedisCacheConfig = {
          store: redisStore as unknown,
          host: redisConnection.host,
          port: redisConnection.port,
          password: redisConnection.password,
          ttl: 300,
          max: 1000,
        };

        if (redisConnection.tls) {
          logger.log('Redis Cache do worker com TLS habilitado');
          redisConfig.tls = redisConnection.tls;
        }

        return redisConfig as unknown as RedisClientOptions;
      },
    }),
    RedisModule,
    BullModule.forRoot(
      (() => {
        const redisConnection = resolveRedisConnection(process.env);
        if (!redisConnection) {
          throw new Error(
            'Redis é obrigatório para o worker. Configure REDIS_URL/URL_REDIS/REDIS_PUBLIC_URL ou REDIS_HOST.',
          );
        }

        return {
          connection: {
            host: redisConnection.host,
            port: redisConnection.port,
            username: redisConnection.username,
            password: redisConnection.password,
            tls: redisConnection.tls,
          },
        };
      })(),
    ),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): TypeOrmModuleOptions => {
        const logger = new Logger('WorkerTypeORM');
        const isProduction = config.get('NODE_ENV') === 'production';
        const rawUrl = resolveDatabaseUrl(config);
        const url = normalizeDatabaseUrlForPg(rawUrl);
        const baseConfig: TypeOrmModuleOptions = {
          type: 'postgres' as const,
          autoLoadEntities: true,
          synchronize: false,
          logger: new DatabaseLogger(),
          logging: isProduction
            ? (['error', 'warn'] as const)
            : (['error', 'warn'] as const),
          maxQueryExecutionTime: 1000,
          extra: {
            max: config.get<number>('DB_POOL_MAX', 5),
            min: config.get<number>('DB_POOL_MIN', 0),
            idleTimeoutMillis: config.get<number>('DB_IDLE_TIMEOUT_MS', 30000),
            connectionTimeoutMillis: config.get<number>(
              'DB_CONNECTION_TIMEOUT_MS',
              10000,
            ),
            application_name: firstNonEmpty([
              config.get<string>('DB_APPLICATION_NAME_WORKER'),
              config.get<string>('DB_APPLICATION_NAME'),
              'api_worker',
            ]),
            // SECURITY: compatível com PgBouncer em modo transaction
            prepareThreshold: 0,
          },
        };
        if (url) {
          logger.log(
            `Connecting via DATABASE_URL (${describeDatabaseTarget(rawUrl)})`,
          );
          return {
            ...baseConfig,
            url,
            ssl: WorkerModule.getSSLConfig(config, isProduction, logger),
          };
        }
        return {
          ...baseConfig,
          host: resolveDatabaseHost(config),
          port: resolveDatabasePort(config),
          username: resolveDatabaseUser(config),
          password: resolveDatabasePassword(config),
          database: resolveDatabaseName(config),
          ssl: WorkerModule.getSSLConfig(config, isProduction, logger),
        };
      },
    }),
    // Apenas módulos relacionados a filas/processamento
    ObservabilityModule,
    ObservabilityWorkerModule,
    RbacModule,
    SecurityAuditModule,
    MailWorkerModule,
    DocumentImportWorkerModule,
    ReportsWorkerModule,
    QueueServicesModule,
    DashboardWorkerModule,
    DisasterRecoveryWorkerModule,
    SlaEscalationWorkerModule,
    ExpiryNotificationsWorkerModule,
    DocumentRetentionWorkerModule,
    TasksWorkerModule,
  ],
  providers: [WorkerHeartbeatReporterService],
})
export class WorkerModule {
  private static getSSLConfig(
    config: ConfigService,
    isProduction: boolean,
    logger: Logger,
  ) {
    const sslEnabled = config.get<boolean>('DATABASE_SSL');
    const sslCA = config.get<string>('DATABASE_SSL_CA');
    const allowInsecure =
      parseBooleanFlag(config.get<string>('DATABASE_SSL_ALLOW_INSECURE')) ||
      parseBooleanFlag(config.get<string>('BANCO_DE_DADOS_SSL'));

    if (!isProduction && !sslEnabled && !allowInsecure) {
      return false;
    }

    if (allowInsecure) {
      logger.warn(
        'SSL inseguro habilitado no worker (rejectUnauthorized:false). Use apenas temporariamente.',
      );
      return resolveDbSslOptions({
        isProduction,
        sslEnabled: !!sslEnabled,
        sslCA,
        allowInsecure: true,
      });
    }

    const sslOptions = resolveDbSslOptions({
      isProduction,
      sslEnabled: !!sslEnabled,
      sslCA,
      allowInsecure: false,
    });
    if (sslCA) {
      logger.log('Worker com SSL + CA customizado');
    } else if (sslOptions) {
      logger.log('Worker com SSL validado');
    }
    return sslOptions;
  }
}
