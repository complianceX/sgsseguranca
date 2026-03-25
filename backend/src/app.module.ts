import {
  Module,
  MiddlewareConsumer,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import { ThrottlerRedisStorageService } from './common/throttler/throttler-redis-storage.service';
import { REDIS_CLIENT } from './common/redis/redis.constants';
import * as Joi from 'joi';
import * as redisStore from 'cache-manager-redis-store';
import type { RedisClientOptions } from 'redis';
interface RedisCacheConfig {
  store: unknown;
  host: string;
  port: number;
  password?: string;
  ttl: number;
  max: number;
  tls?: Record<string, unknown>;
}

// Controllers & Services
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SeedService } from './seed/seed.service';
import { CacheWarmingService } from './common/cache/cache-warming.service';

// Modules
import { CompaniesModule } from './companies/companies.module';
import { UsersModule } from './users/users.module';
import { ProfilesModule } from './profiles/profiles.module';
import { SitesModule } from './sites/sites.module';
import { ActivitiesModule } from './activities/activities.module';
import { RisksModule } from './risks/risks.module';
import { EpisModule } from './epis/epis.module';
import { ToolsModule } from './tools/tools.module';
import { MachinesModule } from './machines/machines.module';
import { AprsModule } from './aprs/aprs.module';
import { PtsModule } from './pts/pts.module';
import { DdsModule } from './dds/dds.module';
import { ChecklistsModule } from './checklists/checklists.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { AiModule } from './ai/ai.module';
import { TrainingsModule } from './trainings/trainings.module';
import { ReportsModule } from './reports/reports.module';
import { MailModule } from './mail/mail.module';
import { SignaturesModule } from './signatures/signatures.module';
import { AuditsModule } from './audits/audits.module';
import { InspectionsModule } from './inspections/inspections.module';
import { NonConformitiesModule } from './nonconformities/nonconformities.module';
import { RdosModule } from './rdos/rdos.module';
import { MedicalExamsModule } from './medical-exams/medical-exams.module';
import { ServiceOrdersModule } from './service-orders/service-orders.module';
import { DocumentImportModule } from './document-import/document-import.module';
import { AuditModule } from './audit/audit.module';
import { ContractsModule } from './contracts/contracts.module';
import { TasksModule } from './tasks/tasks.module';
// import { NotificationsModule } from './notifications/notifications.module';
import { PushModule } from './push/push.module';
import { DataLoaderModule } from './common/dataloader/dataloader.module';
import { MathModule } from './math/math.module';
import { RedisModule } from './common/redis/redis.module';
import { ObservabilityModule } from './common/observability/observability.module';
import { RbacModule } from './rbac/rbac.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DocumentRegistryModule } from './document-registry/document-registry.module';
import { DisasterRecoveryModule } from './disaster-recovery/disaster-recovery.module';
import { CalendarModule } from './calendar/calendar.module';
import { SystemThemeModule } from './system-theme/system-theme.module';
import { TenantPoliciesModule } from './tenant-policies/tenant-policies.module';
import { resolveRedisConnection } from './common/redis/redis-connection.util';
import {
  parseBooleanFlag,
  resolveDbSslOptions,
} from './common/database/db-ssl.util';
// QueueServicesModule removido do AppModule — registra as mesmas filas que
// MailModule/ReportsModule/TasksModule, causando conflito de DI no NestJS.
// Fica apenas no WorkerModule onde tem acesso completo a todas as filas.

// Guards, Interceptors & Middleware
import { IpThrottlerGuard } from './common/guards/ip-throttler.guard';
import { TenantGuard } from './common/guards/tenant.guard';
import { TenantRateLimitGuard } from './common/guards/tenant-rate-limit.guard';
import { UserRateLimitGuard } from './common/guards/user-rate-limit.guard';
import { RateLimitsAdminController } from './common/admin/rate-limits-admin.controller';
import { BusinessMetricsAdminController } from './common/admin/business-metrics-admin.controller';
import { TenantMiddleware } from './common/middleware/tenant.middleware';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { IdempotencyInterceptor } from './common/idempotency/idempotency.interceptor';
import { IdempotencyService } from './common/idempotency/idempotency.service';
import { TimeoutInterceptor } from './common/interceptors/timeout.interceptor';
import { MetricsInterceptor } from './common/interceptors/metrics.interceptor';
import { DatabaseLogger } from './common/logging/database.logger';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';
import { SentryTraceMiddleware } from './common/middleware/sentry-trace.middleware';
import { SecurityAuditModule } from './common/security/security-audit.module';
import { SecurityActionInterceptor } from './common/security/security-action.interceptor';
import { isRedisDisabled } from './queue/redis-disabled-queue';

const queueInfraModules = isRedisDisabled
  ? []
  : [
      BullModule.forRoot(
        (() => {
          const redisConnection = resolveRedisConnection(process.env);
          return {
            connection: {
              host:
                redisConnection?.host || process.env.REDIS_HOST || '127.0.0.1',
              port:
                redisConnection?.port || Number(process.env.REDIS_PORT || 6379),
              username: redisConnection?.username,
              password: redisConnection?.password || process.env.REDIS_PASSWORD,
              tls: redisConnection?.tls,
              connectTimeout: 10_000,
              enableReadyCheck: false,
              maxRetriesPerRequest: 1,
              retryStrategy: () => undefined,
            },
          };
        })(),
      ),
    ];

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

/**
 * 🔒 CONFIGURAÇÃO DE SEGURANÇA E VALIDAÇÃO DE VARIÁVEIS DE AMBIENTE
 *
 * Todas as variáveis de ambiente são validadas usando Joi Schema.
 * Falhas de validação impedem a inicialização da aplicação.
 */
const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test', 'staging')
    .default('development'),
  PORT: Joi.number().default(3000),
  DATABASE_TYPE: Joi.string()
    .valid('postgres', 'sqlite', 'better-sqlite3')
    .default('postgres'),
  SQLITE_DB_PATH: Joi.string().default('dev.sqlite'),
  DATABASE_URL: Joi.string().optional().allow(''),
  DATABASE_PUBLIC_URL: Joi.string().optional().allow(''),
  URL_DO_BANCO_DE_DADOS: Joi.string().optional().allow(''),
  POSTGRES_URL: Joi.string().optional().allow(''),
  POSTGRESQL_URL: Joi.string().optional().allow(''),
  DATABASE_HOST: Joi.string().optional().allow(''),
  DATABASE_PORT: Joi.number().default(5432),
  DATABASE_USER: Joi.string().optional().allow(''),
  DATABASE_PASSWORD: Joi.string().optional().allow(''),
  DATABASE_NAME: Joi.string().optional().allow(''),
  PGHOST: Joi.string().optional().allow(''),
  PGPORT: Joi.number().optional(),
  PGUSER: Joi.string().optional().allow(''),
  PGPASSWORD: Joi.string().optional().allow(''),
  PGDATABASE: Joi.string().optional().allow(''),
  POSTGRES_HOST: Joi.string().optional().allow(''),
  POSTGRES_PORT: Joi.number().optional(),
  POSTGRES_USER: Joi.string().optional().allow(''),
  POSTGRES_PASSWORD: REDACTED
  POSTGRES_DB: Joi.string().optional().allow(''),
  DATABASE_SSL: Joi.boolean().default(false),
  DATABASE_SSL_ALLOW_INSECURE: Joi.boolean().default(false),
  DATABASE_SSL_CA: Joi.string().optional(),
  REDIS_URL: Joi.string().optional(),
  REDIS_DISABLED: Joi.string().valid('true', 'false').optional().allow(''),
  REDIS_HOST: Joi.string().when('REDIS_DISABLED', {
    is: 'true',
    then: Joi.optional().allow(''),
    otherwise: Joi.string().when('REDIS_URL', {
      is: Joi.exist(),
      then: Joi.optional(),
      otherwise: Joi.string().when('NODE_ENV', {
        is: 'production',
        then: Joi.required(),
        otherwise: Joi.string().default('127.0.0.1'),
      }),
    }),
  }),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().optional().allow(''),
  REDIS_TLS: Joi.boolean().default(false),
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRATION: Joi.string().default('7d'),
  MAIL_HOST: Joi.string().optional().allow(''),
  MAIL_PORT: Joi.number().default(587),
  MAIL_SECURE: Joi.boolean().default(false),
  MAIL_USER: Joi.string().optional().allow(''),
  MAIL_PASS: Joi.string().optional().allow(''),
  MAIL_FROM_EMAIL: Joi.string().email().optional().allow(''),
  MAIL_FROM_NAME: Joi.string().default('Sistema'),
  MAIL_ALERT_SCHEDULE_MIN_INTERVAL_MS: Joi.number().default(300000),
  MAIL_ALERT_SCHEDULE_LOCK_TTL_MS: Joi.number().default(600000),
  MAIL_ALERT_COMPANY_BATCH_SIZE: Joi.number().default(10),
  MAIL_ALERT_COMPANY_MAX_PARALLEL: Joi.number().default(2),
  AWS_ACCESS_KEY_ID: REDACTED
  AWS_SECRET_ACCESS_KEY: REDACTED
  AWS_REGION: Joi.string().default('us-east-1'),
  AWS_S3_BUCKET: Joi.string().optional(),
  AWS_S3_ENDPOINT: Joi.string().optional(),
  THROTTLE_TTL: Joi.number().default(60000),
  THROTTLE_LIMIT: Joi.number().default(100),
  // Connection pool — ajuste por ambiente/instância
  // Regra: DB_POOL_MAX * nº_de_instâncias < max_connections do PostgreSQL
  DB_POOL_MAX: Joi.number().default(10),
  DB_POOL_MIN: Joi.number().default(0),
  DB_IDLE_TIMEOUT_MS: Joi.number().default(30000),
  DB_CONNECTION_TIMEOUT_MS: Joi.number().default(10000),
  DB_TIMINGS_ENABLED: Joi.boolean().default(false),
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly')
    .optional()
    .allow(''),
  OTEL_ENABLED: Joi.boolean().default(false),
  OTEL_SERVICE_NAME: Joi.string().optional(),
  OTEL_SERVICE_VERSION: Joi.string().optional(),
  JAEGER_ENDPOINT: Joi.string().optional(),
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

  // Worker quota por tenant (também validado aqui para manter consistência de envs)
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
  WORKER_HEARTBEAT_REQUIRED: Joi.boolean().default(false),
  WORKER_HEARTBEAT_KEY: Joi.string().default('worker:heartbeat:queue-runtime'),
  WORKER_HEARTBEAT_TTL_SECONDS: Joi.number().default(90),
  JAEGER_AGENT_HOST: Joi.string().optional(),
  JAEGER_AGENT_PORT: Joi.number().optional(),
  PROMETHEUS_PORT: Joi.number().optional(),
  SENTRY_DSN: Joi.string().uri().optional().allow(''),
  SENTRY_ENVIRONMENT: Joi.string().optional().allow(''),
  SENTRY_TRACES_SAMPLE_RATE: Joi.number().min(0).max(1).optional(),
  NEW_RELIC_ENABLED: Joi.boolean().default(false),
  AI_PROVIDER: Joi.string()
    .valid('openai', 'anthropic', 'gemini', 'stub', 'local')
    .default('openai'),
  FEATURE_AI_ENABLED: Joi.string().valid('true', 'false').optional(),
  OPENAI_API_KEY: Joi.string().optional().allow(''),
  OPENAI_MODEL: Joi.string().optional().allow(''),
  OPENAI_VISION_MODEL: Joi.string().optional().allow(''),
  OPENAI_FALLBACK_MODEL: Joi.string().optional().allow(''),
  OPENAI_REASONING_EFFORT: Joi.string()
    .valid('minimal', 'low', 'medium', 'high')
    .optional()
    .allow(''),
  AUTH_COOKIE_SAMESITE: Joi.string()
    .valid('strict', 'lax', 'none')
    .optional()
    .allow(''),
  AUTH_COOKIE_SECURE: Joi.string().valid('true', 'false').optional().allow(''),
  AUTH_COOKIE_DOMAIN: Joi.string().optional().allow(''),
  REFRESH_TOKEN_COOKIE_SAMESITE: Joi.string()
    .valid('strict', 'lax', 'none')
    .optional()
    .allow(''),
  REFRESH_TOKEN_COOKIE_SECURE: Joi.string()
    .valid('true', 'false')
    .optional()
    .allow(''),
  REFRESH_TOKEN_COOKIE_DOMAIN: Joi.string().optional().allow(''),
  ANTHROPIC_API_KEY: Joi.string().optional(),
  ANTHROPIC_MODEL: Joi.string().optional().allow(''),
  GEMINI_API_KEY: Joi.string().optional().allow(''),
  GOOGLE_API_KEY: Joi.string().optional().allow(''),
  GEMINI_MODEL: Joi.string().optional().allow(''),
  AI_HISTORY_DEFAULT_DAYS: Joi.number().integer().min(1).default(30),
  AI_HISTORY_MAX_DAYS: Joi.number().integer().min(1).default(90),
  AI_HISTORY_MAX_LIMIT: Joi.number().integer().min(1).max(500).default(100),
  DEV_LOGIN_BYPASS: Joi.boolean().default(false),
  ALLOW_DEV_LOGIN_BYPASS: Joi.boolean().default(false),
  LOGIN_FAIL_MAX: Joi.number().default(10),
  LOGIN_FAIL_WINDOW_SECONDS: Joi.number().default(900),
  LOGIN_FAIL_BLOCK_SECONDS: Joi.number().default(900),
}).custom((value: Record<string, unknown>, helpers) => {
  const env = value as {
    DEV_LOGIN_BYPASS?: boolean;
    ALLOW_DEV_LOGIN_BYPASS?: boolean;
    NODE_ENV?: string;
    DATABASE_URL?: string;
    DATABASE_PUBLIC_URL?: string;
    URL_DO_BANCO_DE_DADOS?: string;
    POSTGRES_URL?: string;
    POSTGRESQL_URL?: string;
    DATABASE_HOST?: string;
    PGHOST?: string;
    POSTGRES_HOST?: string;
    DATABASE_USER?: string;
    PGUSER?: string;
    POSTGRES_USER?: string;
    DATABASE_PASSWORD?: string;
    PGPASSWORD?: string;
    POSTGRES_PASSWORD?: string;
    DATABASE_NAME?: string;
    PGDATABASE?: string;
    POSTGRES_DB?: string;
    DATABASE_TYPE?: string;
  };

  const bypassEnabled = env.DEV_LOGIN_BYPASS === true;
  const explicitlyAllowed = env.ALLOW_DEV_LOGIN_BYPASS === true;
  const isLocalDev = env.NODE_ENV === 'development';
  const hasDatabaseUrl = Boolean(
    firstNonEmpty([
      env.DATABASE_URL,
      env.DATABASE_PUBLIC_URL,
      env.URL_DO_BANCO_DE_DADOS,
      env.POSTGRES_URL,
      env.POSTGRESQL_URL,
    ]),
  );
  const hasDatabaseHost = Boolean(
    firstNonEmpty([env.DATABASE_HOST, env.PGHOST, env.POSTGRES_HOST]),
  );
  const hasDatabaseUser = Boolean(
    firstNonEmpty([env.DATABASE_USER, env.PGUSER, env.POSTGRES_USER]),
  );
  const hasDatabasePassword = Boolean(
    firstNonEmpty([
      env.DATABASE_PASSWORD,
      env.PGPASSWORD,
      env.POSTGRES_PASSWORD,
    ]),
  );
  const hasDatabaseName = Boolean(
    firstNonEmpty([env.DATABASE_NAME, env.PGDATABASE, env.POSTGRES_DB]),
  );

  if (bypassEnabled && (!isLocalDev || !explicitlyAllowed)) {
    return helpers.error('any.invalid', {
      message:
        'DEV_LOGIN_BYPASS só é permitido em NODE_ENV=development com ALLOW_DEV_LOGIN_BYPASS=true',
    });
  }

  if (
    env.DATABASE_TYPE !== 'sqlite' &&
    env.DATABASE_TYPE !== 'better-sqlite3' &&
    !hasDatabaseUrl &&
    (!hasDatabaseHost ||
      !hasDatabaseUser ||
      !hasDatabasePassword ||
      !hasDatabaseName)
  ) {
    return helpers.error('any.invalid', {
      message:
        'Configure DATABASE_URL/DATABASE_PUBLIC_URL/URL_DO_BANCO_DE_DADOS (ou informe DATABASE_HOST, DATABASE_USER, DATABASE_PASSWORD e DATABASE_NAME).',
    });
  }

  return env;
});

@Module({
  imports: [
    // 1. ConfigModule com validação Joi
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema,
      validationOptions: {
        abortEarly: false, // Mostra todos os erros de validação
        allowUnknown: true, // Permite variáveis não definidas no schema
      },
    }),

    // 2. ScheduleModule para tarefas agendadas
    ScheduleModule.forRoot(),

    // 3. ThrottlerModule para rate limiting — storage Redis para multi-instância
    ThrottlerModule.forRootAsync({
      inject: [ConfigService, REDIS_CLIENT],
      useFactory: (
        config: ConfigService,
        redis: Redis,
      ): ThrottlerModuleOptions => ({
        storage: new ThrottlerRedisStorageService(redis),
        throttlers: [
          {
            name: 'default',
            ttl: config.get<number>('THROTTLE_TTL', 60000),
            limit: config.get<number>('THROTTLE_LIMIT', 100),
          },
        ],
      }),
    }),

    // 4. CacheModule com Redis em produção, memória em dev
    CacheModule.registerAsync<RedisClientOptions>({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProduction = config.get('NODE_ENV') === 'production';
        const logger = new Logger('CacheModule');
        const redisDisabled = /^true$/i.test(
          config.get<string>('REDIS_DISABLED', 'false'),
        );
        const redisConnection = resolveRedisConnection(config);

        if (isProduction && !redisDisabled && !redisConnection) {
          throw new Error(
            'Redis é obrigatório em produção. Configure REDIS_URL/URL_REDIS/REDIS_PUBLIC_URL ou REDIS_HOST.',
          );
        }

        if (redisConnection && !redisDisabled) {
          logger.log(
            `🔴 Configurando Redis Cache (${redisConnection.source}) para ${
              isProduction ? 'PRODUÇÃO' : 'desenvolvimento'
            }`,
          );

          const redisConfig: RedisCacheConfig = {
            store: redisStore as unknown,
            host: redisConnection.host,
            port: redisConnection.port,
            password: redisConnection.password,
            ttl: 300, // 5 minutos default
            max: 1000, // Máximo de itens no cache
          };

          if (redisConnection.tls) {
            logger.log('🔒 Redis TLS habilitado');
            redisConfig.tls = redisConnection.tls;
          }

          return redisConfig as unknown as RedisClientOptions;
        }

        if (isProduction && redisDisabled) {
          logger.warn(
            '⚠️ REDIS_DISABLED=true: usando Memory Cache em produção',
          );
        } else if (isProduction && !redisConnection) {
          logger.warn('⚠️ Redis ausente: usando Memory Cache em produção');
        } else {
          logger.log('💾 Configurando Memory Cache para DESENVOLVIMENTO');
        }
        return {
          ttl: 300,
          max: 100,
        };
      },
    }),

    // 5. BullModule (BullMQ) para filas com Redis (Railway-safe)
    ...queueInfraModules,

    // 6. TypeORM com configuração segura de SSL
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const logger = new Logger('TypeORM');
        const isProduction = config.get('NODE_ENV') === 'production';
        const dbType = config.get<'postgres' | 'sqlite'>(
          'DATABASE_TYPE',
          'postgres',
        );
        const url = resolveDatabaseUrl(config);
        logger.log(`🗄️ DATABASE_TYPE=${dbType}`);

        // Configuração base comum
        const commonBase: Pick<
          TypeOrmModuleOptions,
          'autoLoadEntities' | 'logger' | 'logging' | 'maxQueryExecutionTime'
        > = {
          autoLoadEntities: true,
          logger: new DatabaseLogger(),
          logging: isProduction
            ? (['error', 'warn'] as const)
            : (['error', 'warn', 'query'] as const),
          maxQueryExecutionTime: 1000,
        };

        // Fallback de desenvolvimento: SQLite
        if (dbType === 'sqlite') {
          const sqlitePath = config.get<string>('SQLITE_DB_PATH', 'dev.sqlite');
          logger.warn(`🟡 Usando SQLite para DESENVOLVIMENTO (${sqlitePath})`);
          return {
            type: 'better-sqlite3',
            database: sqlitePath,
            synchronize: true,
            ...commonBase,
          } satisfies TypeOrmModuleOptions;
        }

        // Configuração base PostgreSQL
        const baseConfig: TypeOrmModuleOptions = {
          type: 'postgres',
          synchronize: false, // NUNCA true em produção
          ...commonBase,
          // Connection pooling configurável via env
          extra: {
            max: config.get<number>('DB_POOL_MAX', 10),
            min: config.get<number>('DB_POOL_MIN', 0),
            idleTimeoutMillis: config.get<number>('DB_IDLE_TIMEOUT_MS', 30000),
            connectionTimeoutMillis: config.get<number>(
              'DB_CONNECTION_TIMEOUT_MS',
              10000,
            ),
            prepareThreshold: 0,
          },
        };

        // Conexão via DATABASE_URL (Railway, Heroku, etc)
        if (url) {
          logger.log(
            `🔗 Conectando via DATABASE_URL (${describeDatabaseTarget(url)})`,
          );

          return {
            ...baseConfig,
            url,
            ssl: AppModule.getSSLConfig(config, isProduction, logger),
          };
        }

        // Conexão via variáveis individuais
        const host = resolveDatabaseHost(config);
        const port = resolveDatabasePort(config);

        logger.log(`🔗 Conectando ao PostgreSQL: ${host}:${port}`);

        return {
          ...baseConfig,
          host,
          port,
          username: resolveDatabaseUser(config),
          password: resolveDatabasePassword(config),
          database: resolveDatabaseName(config),
          ssl: AppModule.getSSLConfig(config, isProduction, logger),
        };
      },

      dataSourceFactory: (options) => {
        const dsLogger = new Logger('LazyDataSource');
        const dataSource = new DataSource(options!);
        const isProduction = process.env.NODE_ENV === 'production';

        const connectWithRetry = async () => {
          // Para SQLite, inicializa uma única vez sem retry
          if ((options as TypeOrmModuleOptions)?.type === 'sqlite') {
            try {
              await dataSource.initialize();
              dsLogger.log('✅ SQLite connected');
              return;
            } catch (err: unknown) {
              dsLogger.error(
                `❌ Falha ao inicializar SQLite: ${
                  err instanceof Error ? err.message : String(err)
                }`,
              );
              throw err;
            }
          }
          let attempt = 0;
          const maxAttempts = isProduction ? 5 : Number.POSITIVE_INFINITY;
          while (true) {
            try {
              await dataSource.initialize();
              dsLogger.log('✅ PostgreSQL connected');
              return;
            } catch (err: unknown) {
              attempt++;
              const delay = Math.min(
                1_000 * 2 ** Math.min(attempt - 1, 5),
                30_000,
              );
              dsLogger.warn(
                `DB connect attempt ${attempt} failed (${
                  err instanceof Error ? err.message : String(err)
                }) — retrying in ${delay}ms`,
              );
              if (attempt >= maxAttempts) {
                dsLogger.error(
                  `❌ Banco indisponível após ${attempt} tentativas em produção. Abortando bootstrap.`,
                );
                throw err;
              }
              await new Promise<void>((resolve) => setTimeout(resolve, delay));
            }
          }
        };

        if (isProduction) {
          return connectWithRetry().then(() => dataSource);
        }

        void connectWithRetry();
        return Promise.resolve(dataSource);
      },
    }),

    // Feature Modules
    TasksModule,
    ReportsModule,
    MailModule,
    // NotificationsModule,
    PushModule,
    CompaniesModule,
    UsersModule,
    ProfilesModule,
    SitesModule,
    ActivitiesModule,
    RisksModule,
    EpisModule,
    ToolsModule,
    MachinesModule,
    AprsModule,
    PtsModule,
    DdsModule,
    ChecklistsModule,
    CommonModule,
    RedisModule,
    AuthModule,
    AiModule,
    TrainingsModule,
    SignaturesModule,
    AuditsModule,
    InspectionsModule,
    NonConformitiesModule,
    RdosModule,
    MedicalExamsModule,
    ServiceOrdersModule,
    DocumentImportModule,
    AuditModule,
    ContractsModule,
    DataLoaderModule,
    MathModule,
    ObservabilityModule,
    RbacModule,
    DashboardModule,
    DocumentRegistryModule,
    TenantPoliciesModule,
    DisasterRecoveryModule,
    CalendarModule,
    SystemThemeModule,
    SecurityAuditModule,
  ],
  controllers: [
    AppController,
    RateLimitsAdminController,
    BusinessMetricsAdminController,
  ],
  providers: [
    AppService,
    SeedService,
    CacheWarmingService,
    {
      provide: APP_GUARD,
      useClass: IpThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: TenantGuard,
    },
    {
      provide: APP_GUARD,
      useClass: TenantRateLimitGuard,
    },
    {
      provide: APP_GUARD,
      useClass: UserRateLimitGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: IdempotencyInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TimeoutInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: SecurityActionInterceptor,
    },
    IdempotencyService,
  ],
})
export class AppModule implements OnModuleInit {
  private readonly logger = new Logger(AppModule.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * 🔒 VALIDAÇÃO DE SEGURANÇA NA INICIALIZAÇÃO
   *
   * Verifica configurações críticas de segurança antes da aplicação iniciar.
   */
  onModuleInit() {
    const isProduction = this.configService.get('NODE_ENV') === 'production';

    this.logger.log('🚀 Inicializando AppModule...');
    this.logger.log(`📍 Ambiente: ${this.configService.get('NODE_ENV')}`);

    if (isProduction) {
      this.logger.log('🔒 Validando configurações de PRODUÇÃO...');
      this.validateProductionSecurity();
    } else {
      this.logger.warn('⚠️  Ambiente de DESENVOLVIMENTO detectado');
    }

    if (/^true$/i.test(process.env.REDIS_DISABLED || '')) {
      this.logger.warn(
        '⚠️ REDIS_DISABLED=true: runtime em modo degradado. Módulos de fila permanecem ativos, mas jobs assíncronos e Bull Board ficam indisponíveis.',
      );
    }

    this.logger.log('✅ AppModule inicializado com sucesso');
  }

  /**
   * 🔒 VALIDAÇÃO DE SEGURANÇA EM PRODUÇÃO
   *
   * Verifica se todas as configurações críticas estão corretas.
   */
  private validateProductionSecurity() {
    const redisDisabled = /^true$/i.test(
      this.configService.get<string>('REDIS_DISABLED', 'false'),
    );
    const jwtSecret = this.configService.get<string>('JWT_SECRET');
    const databaseSSL = this.configService.get<boolean>('DATABASE_SSL');
    const databaseSSLAllowInsecure = this.configService.get<boolean>(
      'DATABASE_SSL_ALLOW_INSECURE',
    );
    const railwaySelfSigned =
      this.configService.get<string>('BANCO_DE_DADOS_SSL') === 'true';
    const redisHost = this.configService.get<string>('REDIS_HOST');
    const redisUrl =
      this.configService.get<string>('REDIS_URL') ||
      this.configService.get<string>('URL_REDIS') ||
      this.configService.get<string>('REDIS_PUBLIC_URL');
    const corsAllowedOrigins = this.configService.get<string>(
      'CORS_ALLOWED_ORIGINS',
    );
    //

    const checks = [
      {
        name: 'JWT_SECRET',
        valid: jwtSecret && jwtSecret.length >= 32,
        message: 'JWT_SECRET deve ter no mínimo 32 caracteres',
      },
      {
        name: 'DATABASE_SSL_POLICY',
        valid:
          databaseSSL === true ||
          databaseSSLAllowInsecure === true ||
          railwaySelfSigned === true,
        message:
          'Habilite DATABASE_SSL=true em produção (recomendado) ou, apenas em último caso, DATABASE_SSL_ALLOW_INSECURE=true/BANCO_DE_DADOS_SSL=true',
      },
      {
        name: 'REDIS_CONNECTION',
        valid: redisDisabled || !!redisUrl || !!redisHost,
        message:
          'Configure REDIS_URL (recomendado) ou REDIS_HOST em produção, ou defina REDIS_DISABLED=true',
      },
      {
        name: 'CORS_ALLOWED_ORIGINS',
        valid: !!corsAllowedOrigins,
        message:
          'Configure CORS_ALLOWED_ORIGINS em produção com as origens explícitas do frontend',
      },
    ];

    const failures = checks.filter((check) => !check.valid);
    const errors: string[] = [];
    const mailEnabled = process.env.MAIL_ENABLED === 'true';
    if (mailEnabled) {
      if (!process.env.MAIL_HOST) {
        errors.push('MAIL_HOST é obrigatório');
      }
      if (!process.env.MAIL_USER) {
        errors.push('MAIL_USER é obrigatório');
      }
      if (!process.env.MAIL_PASS) {
        errors.push('MAIL_PASS é obrigatório');
      }
    }

    if (failures.length > 0 || errors.length > 0) {
      this.logger.error('❌ FALHAS DE SEGURANÇA DETECTADAS:');
      failures.forEach((failure) => {
        this.logger.error(`   - ${failure.name}: ${failure.message}`);
      });
      errors.forEach((err) => {
        this.logger.error(`   - ${err}`);
      });
      throw new Error('Configuração de segurança inválida em produção');
    }

    this.logger.log('✅ Todas as validações de segurança passaram');
  }

  /**
   * 🔒 CONFIGURAÇÃO SEGURA DE SSL PARA POSTGRESQL
   *
   * - Produção: SSL obrigatório com validação de certificado
   * - Desenvolvimento: SSL opcional
   */
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
      logger.log('🔓 SSL desabilitado (desenvolvimento)');
      return false;
    }

    if (allowInsecure) {
      logger.warn(
        '⚠️  SSL inseguro habilitado (rejectUnauthorized:false). Use apenas temporariamente.',
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
      logger.log('🔒 SSL habilitado com CA customizado');
    } else if (sslOptions) {
      logger.log('🔒 SSL habilitado com validação de certificado');
    }
    return sslOptions;
  }

  /**
   * Configuração de middlewares
   */
  configure(consumer: MiddlewareConsumer) {
    consumer
      // CSRF: removido. Modelo oficial: Authorization Bearer (access token) + refresh token httpOnly cookie.
      // Sem cookie de auth principal, CSRF não se aplica ao fluxo principal.
      .apply(RequestContextMiddleware, SentryTraceMiddleware, TenantMiddleware)
      .forRoutes('*');
  }
}
