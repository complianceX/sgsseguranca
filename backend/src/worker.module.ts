import { Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import * as Joi from 'joi';
import { DatabaseLogger } from './common/logging/database.logger';
import { MailWorkerModule } from './mail/mail.worker.module';
import { ReportsWorkerModule } from './reports/reports.worker.module';
import { QueueServicesModule } from './queue/queue-services.module';
import { ObservabilityModule } from './common/observability/observability.module';
import { SlaEscalationWorkerModule } from './sla-escalation-worker.module';
import { ExpiryNotificationsWorkerModule } from './tasks/expiry-notifications-worker.module';

function firstNonEmpty(values: Array<string | undefined | null>): string | undefined {
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
  DATABASE_SSL_CA: Joi.string().optional(),
  DB_POOL_MAX: Joi.number().default(5),
  DB_POOL_MIN: Joi.number().default(0),
  DB_IDLE_TIMEOUT_MS: Joi.number().default(30000),
  DB_CONNECTION_TIMEOUT_MS: Joi.number().default(10000),
  DB_TIMINGS_ENABLED: Joi.boolean().default(false),
  OTEL_ENABLED: Joi.boolean().default(false),
  OTEL_SERVICE_NAME: Joi.string().optional(),
  OTEL_SERVICE_VERSION: Joi.string().optional(),
  JAEGER_ENDPOINT: Joi.string().optional(),
  PROMETHEUS_PORT: Joi.number().optional(),
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
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT),
        password: process.env.REDIS_PASSWORD,
        tls:
          process.env.REDIS_TLS === 'true'
            ? { rejectUnauthorized: false }
            : undefined,
      },
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const logger = new Logger('WorkerTypeORM');
        const isProduction = config.get('NODE_ENV') === 'production';
        const url = resolveDatabaseUrl(config);
        const baseConfig = {
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
            // SECURITY: compatível com PgBouncer em modo transaction
            prepareThreshold: 0,
          },
        };
        if (url) {
          logger.log(
            `Connecting via DATABASE_URL (${describeDatabaseTarget(url)})`,
          );
          return {
            ...baseConfig,
            url,
            ssl: WorkerModule.getSSLConfig(config, isProduction, logger),
          } as any;
        }
        return {
          ...baseConfig,
          host: resolveDatabaseHost(config),
          port: resolveDatabasePort(config),
          username: resolveDatabaseUser(config),
          password: resolveDatabasePassword(config),
          database: resolveDatabaseName(config),
          ssl: WorkerModule.getSSLConfig(config, isProduction, logger),
        } as any;
      },
    }),
    // Apenas módulos relacionados a filas/processamento
    ObservabilityModule,
    MailWorkerModule,
    ReportsWorkerModule,
    QueueServicesModule,
    SlaEscalationWorkerModule,
    ExpiryNotificationsWorkerModule,
  ],
})
export class WorkerModule {
  private static getSSLConfig(
    config: ConfigService,
    isProduction: boolean,
    logger: Logger,
  ) {
    const sslEnabled = config.get<boolean>('DATABASE_SSL');
    const sslCA = config.get<string>('DATABASE_SSL_CA');
    const railwaySelfSigned =
      config.get<string>('BANCO_DE_DADOS_SSL') === 'true';
    if (!isProduction) {
      return false;
    }
    if (railwaySelfSigned) {
      logger.warn(
        'SSL com rejectUnauthorized:false habilitado (Railway self-signed) para Worker',
      );
      return { rejectUnauthorized: false };
    }
    if (!sslEnabled) {
      logger.warn('SSL desabilitado em PRODUÇÃO para Worker - NÃO RECOMENDADO');
      return false;
    }
    if (sslCA) {
      return { rejectUnauthorized: true, ca: sslCA };
    }
    return { rejectUnauthorized: true };
  }
}
