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
import { ThrottlerModule } from '@nestjs/throttler';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import { ThrottlerRedisStorageService } from './common/throttler/throttler-redis-storage.service';
import {
  REDIS_CLIENT_BULLMQ,
  REDIS_CLIENT_CACHE,
} from './common/redis/redis.constants';
import { RedisModule } from './common/redis/redis.module';
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

function isRenderPrivateKeyValueConnection(
  connection: ResolvedRedisConnection | null,
): boolean {
  if (!connection) return false;

  const host = connection.host.trim().toLowerCase();

  return (
    connection.source === 'url' &&
    connection.url?.startsWith('redis://') === true &&
    /^red-[a-z0-9]+$/.test(host) &&
    connection.port === 6379 &&
    !connection.username &&
    !connection.password
  );
}

// Controllers & Services
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SeedService } from './seed/seed.service';
import { CacheWarmingService } from './common/cache/cache-warming.service';

// Feature modules — agrupados por domínio em config/modules.config.ts
// Para adicionar um novo módulo, edite aquele arquivo.
import { ALL_FEATURE_MODULES } from './config/modules.config';
import {
  resolveRedisConnection,
  isLocalRedisConnection,
  type ResolvedRedisConnection,
} from './common/redis/redis-connection.util';
import {
  doesDatabaseUrlRequireSsl,
  isNeonPoolerHost,
  parseBooleanFlag,
  resolveDatabaseHostname,
  resolveDbSslOptions,
} from './common/database/db-ssl.util';
import { N1QueryDetectorService } from './common/database/n1-query-detector.service';
import { PostgresApplicationNameService } from './common/database/postgres-application-name.service';
// QueueServicesModule removido do AppModule — registra as mesmas filas que
// MailModule/ReportsModule/TasksModule, causando conflito de DI no NestJS.
// Fica apenas no WorkerModule onde tem acesso completo a todas as filas.

// Guards, Interceptors & Middleware
import { AuthorizationContractGuard } from './auth/authorization-contract.guard';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { IpThrottlerGuard } from './common/guards/ip-throttler.guard';
import { TenantGuard } from './common/guards/tenant.guard';
import { TenantRateLimitGuard } from './common/guards/tenant-rate-limit.guard';
import { UserRateLimitGuard } from './common/guards/user-rate-limit.guard';
import { RateLimitsAdminController } from './common/admin/rate-limits-admin.controller';
import { BusinessMetricsAdminController } from './common/admin/business-metrics-admin.controller';
import { TenantMiddleware } from './common/middleware/tenant.middleware';
import { CsrfMiddleware } from './common/middleware/csrf.middleware';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { IdempotencyInterceptor } from './common/idempotency/idempotency.interceptor';
import { IdempotencyService } from './common/idempotency/idempotency.service';
import { TimeoutInterceptor } from './common/interceptors/timeout.interceptor';
import { MetricsInterceptor } from './common/interceptors/metrics.interceptor';
import { CacheControlHeadersInterceptor } from './common/interceptors/cache-control-headers.interceptor';
import { ResilientThrottlerInterceptor } from './common/throttler/resilient-throttler.interceptor';
import { DatabaseLogger } from './common/logging/database.logger';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';
import { SentryTraceMiddleware } from './common/middleware/sentry-trace.middleware';
import { SecurityActionInterceptor } from './common/security/security-action.interceptor';
import { AuditReadInterceptor } from './common/security/audit-read.interceptor';
import { ForbiddenSpikeInterceptor } from './common/security/forbidden-spike.interceptor';
import { hasValidFieldEncryptionKey } from './common/security/field-encryption.util';
import { PaginationClampMiddleware } from './common/middleware/pagination-clamp.middleware';
import { AdminIpAllowlistMiddleware } from './common/middleware/admin-ip-allowlist.middleware';
import { BullQueueShutdownService } from './queue/bull-queue-shutdown.service';
import {
  createRedisDisabledQueueProvider,
  isRedisDisabled,
} from './queue/redis-disabled-queue';

const IS_PRODUCTION_ENV = process.env.NODE_ENV === 'production';
const REDIS_FAIL_OPEN_REQUESTED = /^true$/i.test(
  process.env.REDIS_FAIL_OPEN || (IS_PRODUCTION_ENV ? 'false' : 'true'),
);

const queueRedisConnection = resolveRedisConnection(process.env, 'queue');
const shouldUseQueueRedisInfra =
  !isRedisDisabled &&
  Boolean(queueRedisConnection) &&
  (IS_PRODUCTION_ENV ||
    !REDIS_FAIL_OPEN_REQUESTED ||
    !isLocalRedisConnection(queueRedisConnection));

const queueInfraModules = shouldUseQueueRedisInfra
  ? [
      BullModule.forRootAsync({
        imports: [RedisModule],
        inject: [REDIS_CLIENT_BULLMQ],
        useFactory: (bullmqRedisClient: Redis) => ({
          connection: bullmqRedisClient,
        }),
      }),
    ]
  : [];

const businessMetricsQueueModules = shouldUseQueueRedisInfra
  ? [
      BullModule.registerQueue(
        { name: 'mail' },
        { name: 'pdf-generation' },
        { name: 'document-import' },
      ),
    ]
  : [];

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

/**
 * 🔒 CONFIGURAÇÃO DE SEGURANÇA E VALIDAÇÃO DE VARIÁVEIS DE AMBIENTE
 *
 * Todas as variáveis de ambiente são validadas usando Joi Schema.
 * Falhas de validação impedem a inicialização da aplicação.
 */
export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test', 'staging')
    .default('development'),
  PORT: Joi.number().default(3000),
  DATABASE_TYPE: Joi.string()
    .valid('postgres', 'sqlite', 'better-sqlite3')
    .default('postgres'),
  SQLITE_DB_PATH: Joi.string().default('dev.sqlite'),
  DATABASE_URL: Joi.string().optional().allow(''),
  DATABASE_PRIVATE_URL: Joi.string().optional().allow(''),
  DATABASE_REPLICA_URL: Joi.string().optional().allow(''),
  DATABASE_PUBLIC_URL: Joi.string().optional().allow(''),
  API_PUBLIC_URL: Joi.string().optional().allow(''),
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
  POSTGRES_PASSWORD: Joi.string().optional().allow(''),
  POSTGRES_DB: Joi.string().optional().allow(''),
  DATABASE_SSL: Joi.boolean().default(false),
  // SECURITY: conexões inseguras (rejectUnauthorized=false) não são suportadas.
  // O runtime falha fechado em resolveDbSslOptions.
  DATABASE_SSL_ALLOW_INSECURE: Joi.boolean().valid(false).default(false),
  DATABASE_SSL_ALLOW_INSECURE_FORCE: Joi.boolean().valid(false).default(false),
  DATABASE_SSL_ALLOW_SUPABASE_CERT_FALLBACK: Joi.boolean().default(false),
  DATABASE_SSL_CA: Joi.string().optional(),
  LEGACY_CPF_PLAINTEXT_LOOKUP_ENABLED: Joi.boolean().default(false),
  REDIS_URL: Joi.string().optional(),
  REDIS_AUTH_URL: Joi.string().optional().allow(''),
  REDIS_AUTH_HOST: Joi.string().optional().allow(''),
  REDIS_AUTH_PORT: Joi.number().optional(),
  REDIS_AUTH_PASSWORD: Joi.string().optional().allow(''),
  REDIS_AUTH_USERNAME: Joi.string().optional().allow(''),
  REDIS_AUTH_TLS: Joi.boolean().default(false),
  REDIS_AUTH_TLS_ALLOW_INSECURE: Joi.boolean().default(false),
  REDIS_CACHE_URL: Joi.string().optional().allow(''),
  REDIS_CACHE_HOST: Joi.string().optional().allow(''),
  REDIS_CACHE_PORT: Joi.number().optional(),
  REDIS_CACHE_PASSWORD: Joi.string().optional().allow(''),
  REDIS_CACHE_USERNAME: Joi.string().optional().allow(''),
  REDIS_CACHE_TLS: Joi.boolean().default(false),
  REDIS_CACHE_TLS_ALLOW_INSECURE: Joi.boolean().default(false),
  REDIS_QUEUE_URL: Joi.string().optional().allow(''),
  REDIS_QUEUE_HOST: Joi.string().optional().allow(''),
  REDIS_QUEUE_PORT: Joi.number().optional(),
  REDIS_QUEUE_PASSWORD: Joi.string().optional().allow(''),
  REDIS_QUEUE_USERNAME: Joi.string().optional().allow(''),
  REDIS_QUEUE_TLS: Joi.boolean().default(false),
  REDIS_QUEUE_TLS_ALLOW_INSECURE: Joi.boolean().default(false),
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
  MFA_ENABLED: Joi.boolean().default(true),
  MFA_ISSUER: Joi.string().optional().allow(''),
  MFA_JWT_SECRET: Joi.string().min(32).optional().allow(''),
  MFA_TOTP_ENCRYPTION_KEY: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.when('MFA_ENABLED', {
      is: true,
      then: Joi.string().min(32).required(),
      otherwise: Joi.string().optional().allow(''),
    }),
    otherwise: Joi.string()
      .min(32)
      .default('test-mfa-totp-encryption-key-32-bytes!!!'),
  }),
  MFA_LOGIN_CHALLENGE_TTL_SECONDS: Joi.number()
    .integer()
    .min(60)
    .max(900)
    .default(300),
  MFA_BOOTSTRAP_TTL_SECONDS: Joi.number()
    .integer()
    .min(120)
    .max(1800)
    .default(900),
  MFA_STEP_UP_TTL_SECONDS: Joi.number().integer().min(60).max(900).default(300),
  MFA_MAX_CHALLENGE_ATTEMPTS: Joi.number().integer().min(1).max(10).default(5),
  ADMIN_GERAL_MFA_REQUIRED: Joi.boolean().when('NODE_ENV', {
    is: 'production',
    then: Joi.boolean().default(true),
    otherwise: Joi.boolean().default(false),
  }),
  ADMIN_EMPRESA_MFA_REQUIRED: Joi.boolean().default(false),
  ADMIN_EMPRESA_MFA_ENFORCEMENT_DATE: Joi.string()
    .isoDate()
    .optional()
    .allow(''),
  ADMIN_EMPRESA_STEP_UP_PASSWORD_FALLBACK_ENABLED: Joi.boolean().default(true),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  FIELD_ENCRYPTION_ENABLED: Joi.boolean().default(true),
  FIELD_ENCRYPTION_KEY: Joi.string().optional().allow(''),
  FIELD_ENCRYPTION_HASH_KEY: Joi.string().optional().allow(''),
  VALIDATION_TOKEN_SECRET: Joi.string().min(32).optional().allow(''),
  ACCESS_TOKEN_TTL: Joi.string().optional().allow(''),
  JWT_EXPIRES_IN: Joi.string().default('15m'),
  REFRESH_TOKEN_TTL: Joi.string()
    .pattern(/^\d+(s|m|h|d)$/i)
    .optional()
    .allow(''),
  REFRESH_TOKEN_TTL_DAYS: Joi.number().integer().min(1).max(3650).optional(),
  JWT_REFRESH_EXPIRATION: Joi.string().default('7d'),
  REFRESH_THROTTLE_LIMIT: Joi.number().integer().min(1).max(100).default(20),
  REFRESH_THROTTLE_TTL: Joi.number()
    .integer()
    .min(1000)
    .max(300000)
    .default(60000),
  LOGIN_FAIL_ACCOUNT_MAX: Joi.number().integer().min(3).max(50).optional(),
  LOGIN_FAIL_ACCOUNT_BLOCK_SECONDS: Joi.number()
    .integer()
    .min(60)
    .max(86400)
    .optional(),
  AUTH_ME_THROTTLE_LIMIT: Joi.number().integer().min(1).default(1200),
  AUTH_ME_THROTTLE_TTL: Joi.number()
    .integer()
    .min(1000)
    .max(300000)
    .default(60000),
  AUTH_ME_TENANT_THROTTLE_LIMIT: Joi.number().integer().min(1).default(1200),
  AUTH_ME_TENANT_THROTTLE_HOUR_LIMIT: Joi.number()
    .integer()
    .min(1)
    .default(72000),
  DDS_CREATE_TENANT_THROTTLE_LIMIT: Joi.number().integer().min(1).default(120),
  DDS_CREATE_TENANT_THROTTLE_HOUR_LIMIT: Joi.number()
    .integer()
    .min(1)
    .default(7200),
  DDS_STATUS_TENANT_THROTTLE_LIMIT: Joi.number().integer().min(1).default(120),
  DDS_STATUS_TENANT_THROTTLE_HOUR_LIMIT: Joi.number()
    .integer()
    .min(1)
    .default(7200),
  DDS_SIGNATURES_TENANT_THROTTLE_LIMIT: Joi.number()
    .integer()
    .min(1)
    .default(120),
  DDS_SIGNATURES_TENANT_THROTTLE_HOUR_LIMIT: Joi.number()
    .integer()
    .min(1)
    .default(7200),
  DDS_UPLOAD_TENANT_THROTTLE_LIMIT: Joi.number().integer().min(1).default(60),
  DDS_UPLOAD_TENANT_THROTTLE_HOUR_LIMIT: Joi.number()
    .integer()
    .min(1)
    .default(3600),
  REFRESH_CSRF_ENFORCED: Joi.boolean().when('NODE_ENV', {
    is: 'production',
    then: Joi.boolean().default(true),
    otherwise: Joi.boolean().default(false),
  }),
  REFRESH_CSRF_REPORT_ONLY: Joi.boolean().default(false),
  THROTTLER_FAIL_CLOSED_AUTH_ROUTES: Joi.boolean().default(true),
  THROTTLER_STORAGE_FAIL_OPEN: Joi.boolean().when('NODE_ENV', {
    is: 'production',
    then: Joi.boolean().default(false),
    otherwise: Joi.boolean().default(true),
  }),
  THROTTLER_STORAGE_REDIS_TIMEOUT_MS: Joi.number()
    .integer()
    .min(25)
    .max(5000)
    .default(200),
  THROTTLER_AUTH_LOCAL_FALLBACK_ENABLED: Joi.boolean().default(true),
  THROTTLER_AUTH_LOCAL_FALLBACK_LIMIT: Joi.number()
    .integer()
    .min(1)
    .max(2000)
    .default(60),
  THROTTLER_AUTH_LOCAL_FALLBACK_TTL_MS: Joi.number()
    .integer()
    .min(1000)
    .max(300000)
    .default(60000),
  THROTTLER_AUTH_ME_LOCAL_FALLBACK_LIMIT: Joi.number()
    .integer()
    .min(1)
    .max(20000)
    .default(1200),
  THROTTLER_AUTH_ME_LOCAL_FALLBACK_TTL_MS: Joi.number()
    .integer()
    .min(1000)
    .max(300000)
    .default(60000),
  THROTTLER_DECISION_TIMEOUT_MS: Joi.number()
    .integer()
    .min(50)
    .max(5000)
    .default(250),
  THROTTLER_AUTH_FALLBACK_LOG_COOLDOWN_MS: Joi.number()
    .integer()
    .min(1000)
    .max(300000)
    .default(15000),
  RBAC_ACCESS_CACHE_TTL_SECONDS: Joi.number()
    .integer()
    .min(0)
    .max(300)
    .default(120),
  AUTH_SESSION_USER_CACHE_TTL_SECONDS: Joi.number()
    .integer()
    .min(0)
    .max(300)
    .default(45),
  AUTH_PROFILE_NAME_CACHE_TTL_SECONDS: Joi.number()
    .integer()
    .min(0)
    .max(3600)
    .default(300),
  MAX_ACTIVE_SESSIONS_PER_USER: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(10),
  PASSWORD_ARGON2_MEMORY_COST_KIB: Joi.number()
    .integer()
    .min(12288)
    .max(131072)
    .default(19456),
  PASSWORD_ARGON2_TIME_COST: Joi.number().integer().min(1).max(6).default(2),
  PASSWORD_ARGON2_PARALLELISM: Joi.number().integer().min(1).max(4).default(1),
  PASSWORD_HASH_MAX_CONCURRENCY: Joi.number()
    .integer()
    .min(1)
    .max(64)
    .default(8),
  PASSWORD_HASH_WRITE_MAX_CONCURRENCY: Joi.number()
    .integer()
    .min(1)
    .max(64)
    .default(8),
  PASSWORD_VERIFY_MAX_CONCURRENCY: Joi.number()
    .integer()
    .min(1)
    .max(64)
    .default(8),
  PUBLIC_VALIDATION_LEGACY_COMPAT: Joi.boolean().default(false),
  PUBLIC_VALIDATION_LOG_CONTRACT_USAGE: Joi.boolean().default(true),
  PUBLIC_VALIDATION_TOKEN_TTL_SECONDS: Joi.number()
    .integer()
    .min(300)
    .max(2592000)
    .default(604800),
  PUBLIC_VALIDATION_KILL_SWITCH: Joi.boolean().default(false),
  SECURITY_HARDENING_PHASE: Joi.string().optional().allow(''),
  MAIL_ENABLED: Joi.boolean().default(true),
  MAIL_HOST: Joi.string().optional().allow(''),
  MAIL_PORT: Joi.number().default(587),
  MAIL_SECURE: Joi.boolean().default(false),
  MAIL_USER: Joi.string().optional().allow(''),
  MAIL_PASS: Joi.string().optional().allow(''),
  MAIL_FROM_EMAIL: Joi.string().email().optional().allow(''),
  MAIL_FROM_NAME: Joi.string().default('Sistema'),
  MAIL_REPLY_TO_EMAIL: Joi.string().email().optional().allow(''),
  MAIL_REPLY_TO_NAME: Joi.string().optional().allow(''),
  MAIL_ALERT_SCHEDULE_MIN_INTERVAL_MS: Joi.number().default(300000),
  MAIL_ALERT_SCHEDULE_LOCK_TTL_MS: Joi.number().default(600000),
  MAIL_ALERT_COMPANY_BATCH_SIZE: Joi.number().default(10),
  MAIL_ALERT_COMPANY_MAX_PARALLEL: Joi.number().default(2),
  AWS_ACCESS_KEY_ID: Joi.string().optional().allow(''),
  AWS_SECRET_ACCESS_KEY: Joi.string().optional().allow(''),
  AWS_REGION: Joi.string().default('us-east-1'),
  AWS_S3_BUCKET: Joi.string().optional(),
  AWS_S3_ENDPOINT: Joi.string().optional(),
  AWS_BUCKET_NAME: Joi.string().optional().allow(''),
  AWS_ENDPOINT: Joi.string().uri().optional().allow(''),
  S3_FORCE_PATH_STYLE: Joi.boolean().default(false),
  DR_STORAGE_REPLICA_BUCKET: Joi.string().optional().allow(''),
  DR_STORAGE_REPLICA_ENDPOINT: Joi.string().uri().optional().allow(''),
  DR_STORAGE_REPLICA_REGION: Joi.string().optional().allow(''),
  DR_STORAGE_REPLICA_ACCESS_KEY_ID: Joi.string().optional().allow(''),
  DR_STORAGE_REPLICA_SECRET_ACCESS_KEY: Joi.string().optional().allow(''),
  DR_STORAGE_REPLICA_FORCE_PATH_STYLE: Joi.boolean().default(false),
  // Dev fallback: quando S3/R2 não está configurado, permite usar FS local para artefatos governados.
  // Produção: mantenha vazio e configure AWS_BUCKET_NAME/AWS_ENDPOINT.
  LOCAL_DOCUMENT_STORAGE_DIR: Joi.string().optional().allow(''),
  THROTTLE_TTL: Joi.number().default(60000),
  THROTTLE_LIMIT: Joi.number().default(100),
  // Connection pool — ajuste por ambiente/instância
  // Regra: DB_POOL_MAX * nº_de_instâncias < max_connections do PostgreSQL
  // Railway starter: max_connections = 97 → max 20 por instância (com 1 worker)
  // Supabase free: max_connections = 60 → max 15 por instância
  DB_POOL_MAX: Joi.number().default(20),
  // min > 0 pré-aquece conexões e elimina cold-start de pool em picos de tráfego
  DB_POOL_MIN: Joi.number().default(2),
  DB_IDLE_TIMEOUT_MS: Joi.number().default(30000),
  DB_CONNECTION_TIMEOUT_MS: Joi.number().default(10000),
  // statement_timeout: mata queries travadas (segurança e previsibilidade de SLA)
  DB_STATEMENT_TIMEOUT_MS: Joi.number().default(0), // 0 = desabilitado (default PG)
  DB_APPLICATION_NAME: Joi.string().optional().allow(''),
  DB_APPLICATION_NAME_WEB: Joi.string().optional().allow(''),
  DATABASE_POOLER_ALLOW_SESSION_RLS: Joi.boolean().default(false),
  DB_TIMINGS_ENABLED: Joi.boolean().default(false),
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly')
    .optional()
    .allow(''),
  OTEL_ENABLED: Joi.boolean().default(false),
  OTEL_SERVICE_NAME: Joi.string().optional(),
  OTEL_SERVICE_VERSION: Joi.string().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: Joi.string().uri().optional(),
  OTEL_TRACES_SAMPLER: Joi.string()
    .valid(
      'always_on',
      'always_off',
      'traceidratio',
      'parentbased_always_on',
      'parentbased_always_off',
      'parentbased_traceidratio',
    )
    .optional(),
  OTEL_TRACES_SAMPLER_ARG: Joi.number().min(0).max(1).optional(),
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
  TURNSTILE_ENABLED: Joi.boolean().default(false),
  TURNSTILE_SECRET_KEY: Joi.string().optional().allow(''),
  TURNSTILE_VERIFY_TIMEOUT_MS: Joi.number().default(5000),
  NEW_RELIC_ENABLED: Joi.boolean().default(false),

  // Push Notifications (Web Push / VAPID)
  VAPID_PUBLIC_KEY: Joi.string().optional().allow(''),
  VAPID_PRIVATE_KEY: Joi.string().optional().allow(''),
  VAPID_MAILTO: Joi.string().optional().allow(''),

  // Auth CSRF endpoint throttle
  CSRF_THROTTLE_LIMIT: Joi.number().integer().min(5).max(500).optional(),
  CSRF_THROTTLE_TTL: Joi.number().integer().min(1000).optional(),

  // Dashboard Cache — CACHE-ASIDE pattern
  DASHBOARD_CACHE_ENABLED: Joi.boolean().default(true),
  DASHBOARD_CACHE_TTL_METRICS: Joi.number()
    .integer()
    .min(60)
    .max(3600)
    .default(300),
  DASHBOARD_CACHE_TTL_ACTIVITIES: Joi.number()
    .integer()
    .min(30)
    .max(600)
    .default(60),

  // Resilient Throttler — Rate limiting com fail-closed
  THROTTLER_ENABLED: Joi.boolean().default(true),
  THROTTLER_FAIL_CLOSED: Joi.boolean().default(true),
  THROTTLER_WINDOW_MS: Joi.number()
    .integer()
    .min(1000)
    .max(300000)
    .default(60000),
  THROTTLER_AUTH_LIMIT: Joi.number().integer().min(1).max(100).default(5),
  THROTTLER_PUBLIC_LIMIT: Joi.number().integer().min(1).max(100).default(10),
  THROTTLER_API_LIMIT: Joi.number().integer().min(1).max(1000).default(100),
  THROTTLER_DASHBOARD_LIMIT: Joi.number().integer().min(1).max(500).default(50),

  // CSRF Protection
  CSRF_TOKEN_SECRET: Joi.string().min(32).optional().allow(''),
  CSRF_TOKEN_TTL_SECONDS: Joi.number()
    .integer()
    .min(300)
    .max(3600)
    .default(900),

  // N+1 Query Detection — development only
  N1_QUERY_DETECTION_ENABLED: Joi.boolean().default(false),
  N1_QUERY_THRESHOLD: Joi.number().integer().min(2).max(100).default(3),
  N1_SLOW_QUERY_THRESHOLD: Joi.number()
    .integer()
    .min(50)
    .max(5000)
    .default(100),

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
  ADMIN_IP_ALLOWLIST: Joi.string().optional().allow(''),
  HIBP_CHECK_ENABLED: Joi.string().valid('true', 'false').optional().allow(''),
  HIBP_TIMEOUT_MS: Joi.number().integer().min(500).max(10000).optional(),
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
    AWS_BUCKET_NAME?: string;
    AWS_S3_BUCKET?: string;
    AWS_ACCESS_KEY_ID?: string;
    AWS_SECRET_ACCESS_KEY?: string;
    AWS_ENDPOINT?: string;
    AWS_S3_ENDPOINT?: string;
    S3_FORCE_PATH_STYLE?: boolean;
    DR_STORAGE_REPLICA_BUCKET?: string;
    DR_STORAGE_REPLICA_ENDPOINT?: string;
    DR_STORAGE_REPLICA_ACCESS_KEY_ID?: string;
    DR_STORAGE_REPLICA_SECRET_ACCESS_KEY?: string;
    DR_STORAGE_REPLICA_FORCE_PATH_STYLE?: boolean;
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

  const isProduction = env.NODE_ENV === 'production';
  const storageBucket = firstNonEmpty([env.AWS_BUCKET_NAME, env.AWS_S3_BUCKET]);
  const storageEndpoint = firstNonEmpty([
    env.AWS_ENDPOINT,
    env.AWS_S3_ENDPOINT,
  ]);
  const storageUsesCloudflareR2 = /cloudflarestorage\.com$/i.test(
    (() => {
      try {
        return storageEndpoint ? new URL(storageEndpoint).hostname : '';
      } catch {
        return '';
      }
    })(),
  );

  if (
    isProduction &&
    (!storageBucket || !env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY)
  ) {
    return helpers.error('any.invalid', {
      message:
        'Produção exige storage documental governado: configure AWS_BUCKET_NAME/AWS_S3_BUCKET, AWS_ACCESS_KEY_ID e AWS_SECRET_ACCESS_KEY.',
    });
  }

  if (
    isProduction &&
    storageUsesCloudflareR2 &&
    env.S3_FORCE_PATH_STYLE !== true
  ) {
    return helpers.error('any.invalid', {
      message:
        'Cloudflare R2 exige S3_FORCE_PATH_STYLE=true para evitar URLs virtuais incompatíveis com o endpoint da conta.',
    });
  }

  if (
    isProduction &&
    env.DR_STORAGE_REPLICA_BUCKET &&
    (!env.DR_STORAGE_REPLICA_ENDPOINT ||
      (!env.DR_STORAGE_REPLICA_ACCESS_KEY_ID && !env.AWS_ACCESS_KEY_ID) ||
      (!env.DR_STORAGE_REPLICA_SECRET_ACCESS_KEY && !env.AWS_SECRET_ACCESS_KEY))
  ) {
    return helpers.error('any.invalid', {
      message:
        'DR_STORAGE_REPLICA_BUCKET foi configurado, mas endpoint ou credenciais de réplica estão ausentes.',
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

    // 2. ThrottlerModule para rate limiting — storage Redis para multi-instância
    ThrottlerModule.forRootAsync({
      inject: [ConfigService, REDIS_CLIENT_CACHE],
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

    // 3. CacheModule com Redis em produção, memória em dev
    CacheModule.registerAsync<RedisClientOptions>({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProduction = config.get('NODE_ENV') === 'production';
        const logger = new Logger('CacheModule');
        const redisDisabled = /^true$/i.test(
          config.get<string>('REDIS_DISABLED', 'false'),
        );
        const redisConnection = resolveRedisConnection(config, 'cache');

        if (isProduction && !redisDisabled && !redisConnection) {
          throw new Error(
            'Redis CACHE é obrigatório em produção. Configure REDIS_CACHE_URL ou fallback genérico.',
          );
        }

        const shouldUseRedisCache =
          redisConnection &&
          !redisDisabled &&
          (isProduction || !isLocalRedisConnection(redisConnection));

        if (shouldUseRedisCache) {
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

        if (
          isProduction &&
          redisConnection &&
          isLocalRedisConnection(redisConnection)
        ) {
          throw new Error(
            'Redis CACHE local detectado em produção. Configure REDIS_CACHE_URL/REDIS_URL com host remoto.',
          );
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
    ...businessMetricsQueueModules,

    // 6. TypeORM com configuração segura de SSL
    TypeOrmModule.forRootAsync({
      inject: [ConfigService, N1QueryDetectorService],
      useFactory: (
        config: ConfigService,
        n1Detector: N1QueryDetectorService,
      ) => {
        const logger = new Logger('TypeORM');
        const isProduction = config.get('NODE_ENV') === 'production';
        const dbType = config.get<'postgres' | 'sqlite'>(
          'DATABASE_TYPE',
          'postgres',
        );
        const rawUrl = resolveDatabaseUrl(config);
        const url = normalizeDatabaseUrlForPg(rawUrl);
        logger.log(`🗄️ DATABASE_TYPE=${dbType}`);

        const dbLogger = new DatabaseLogger();
        dbLogger.setN1Detector(n1Detector);

        // Configuração base comum
        const commonBase: Pick<
          TypeOrmModuleOptions,
          'autoLoadEntities' | 'logger' | 'logging' | 'maxQueryExecutionTime'
        > = {
          autoLoadEntities: true,
          logger: dbLogger,
          logging: isProduction
            ? (['error', 'warn'] as const)
            : (['error', 'warn', 'query'] as const),
          maxQueryExecutionTime: 1000,
        };

        // Guard: SQLite é inseguro para multi-tenant (sem RLS) — bloqueia produção
        if (isProduction && dbType !== 'postgres') {
          throw new Error(
            'FATAL: DATABASE_TYPE deve ser "postgres" em produção. ' +
              'SQLite não oferece RLS e é inseguro para ambientes multi-tenant.',
          );
        }

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
            max: config.get<number>('DB_POOL_MAX', 20),
            min: config.get<number>('DB_POOL_MIN', 2),
            idleTimeoutMillis: config.get<number>('DB_IDLE_TIMEOUT_MS', 30000),
            connectionTimeoutMillis: config.get<number>(
              'DB_CONNECTION_TIMEOUT_MS',
              10000,
            ),
            // Keepalive previne que firewalls/load balancers dropem conexões
            // ociosas silenciosamente (crítico para Neon serverless)
            keepAlive: true,
            keepAliveInitialDelayMillis: 10_000,
            application_name: firstNonEmpty([
              config.get<string>('DB_APPLICATION_NAME_WEB'),
              config.get<string>('DB_APPLICATION_NAME'),
              'api_web',
            ]),
            // prepareThreshold: 0 mantido para compatibilidade com PgBouncer
            // (transaction mode não suporta prepared statements por sessão)
            prepareThreshold: 0,
            // statement_timeout: mata queries travadas no banco (ms). 0 = off.
            // Setar via env DB_STATEMENT_TIMEOUT_MS em produção (ex: 30000 = 30s).
            ...(config.get<number>('DB_STATEMENT_TIMEOUT_MS', 0) > 0
              ? {
                  options: `-c statement_timeout=${config.get<number>('DB_STATEMENT_TIMEOUT_MS', 0)}`,
                }
              : {}),
          },
        };

        // Conexão via DATABASE_URL (Railway, Heroku, etc)
        if (url) {
          logger.log(
            `🔗 Conectando via DATABASE_URL (${describeDatabaseTarget(rawUrl)})`,
          );

          const sslConfig = AppModule.getSSLConfig(
            config,
            isProduction,
            logger,
          );

          // Read replica opcional. Quando DATABASE_REPLICA_URL está setado, o
          // TypeORM roteia automaticamente SELECT para o slave e
          // INSERT/UPDATE/DELETE/transações para o master. Dashboards e
          // listagens (read-heavy) ficam isolados do tráfego de escrita,
          // permitindo escalar leituras horizontalmente.
          const rawReplicaUrl = config
            .get<string>('DATABASE_REPLICA_URL')
            ?.trim();
          const replicaUrl = normalizeDatabaseUrlForPg(rawReplicaUrl);

          if (replicaUrl) {
            logger.log(
              `🔁 Read replica configurada (${describeDatabaseTarget(rawReplicaUrl)})`,
            );
            return {
              ...baseConfig,
              replication: {
                master: { url, ssl: sslConfig },
                slaves: [{ url: replicaUrl, ssl: sslConfig }],
              },
            } as TypeOrmModuleOptions;
          }

          return {
            ...baseConfig,
            url,
            ssl: sslConfig,
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
        const isTest = process.env.NODE_ENV === 'test';

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
          const maxAttempts = isProduction
            ? 5
            : isTest
              ? 3
              : Number.POSITIVE_INFINITY;
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

        if (isProduction || isTest) {
          return connectWithRetry().then(() => dataSource);
        }

        void connectWithRetry();
        return Promise.resolve(dataSource);
      },
    }),

    // Feature modules — agrupados por domínio: Identity, Tenant, Operations,
    // Compliance, Privacy, Communication, Infrastructure.
    // Edite backend/src/config/modules.config.ts para adicionar novos módulos.
    ...ALL_FEATURE_MODULES,
  ],
  controllers: [
    AppController,
    RateLimitsAdminController,
    ...(shouldUseQueueRedisInfra ? [BusinessMetricsAdminController] : []),
  ],
  providers: [
    AppService,
    SeedService,
    CacheWarmingService,
    BullQueueShutdownService,
    PostgresApplicationNameService,
    ...(!shouldUseQueueRedisInfra
      ? [
          createRedisDisabledQueueProvider('mail', { addMode: 'noop' }),
          createRedisDisabledQueueProvider('pdf-generation', {
            addMode: 'noop',
          }),
          createRedisDisabledQueueProvider('document-import', {
            addMode: 'noop',
          }),
        ]
      : []),
    // Ordem importa: JWT valida primeiro, depois throttle, depois tenant.
    // JwtAuthGuard respeita @Public() — rotas sem @Public() exigem Bearer token.
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
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
      useClass: AuthorizationContractGuard,
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
      useClass: ResilientThrottlerInterceptor,
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
      useClass: CacheControlHeadersInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: SecurityActionInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditReadInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ForbiddenSpikeInterceptor,
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
    const securityHardeningPhase =
      this.configService.get<string>('SECURITY_HARDENING_PHASE') || 'unset';

    this.logger.log('🚀 Inicializando AppModule...');
    this.logger.log(`📍 Ambiente: ${this.configService.get('NODE_ENV')}`);
    this.logger.log(`🛡️ Security hardening phase: ${securityHardeningPhase}`);

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
    const databaseSSLAllowInsecureForce = this.configService.get<boolean>(
      'DATABASE_SSL_ALLOW_INSECURE_FORCE',
    );
    const legacyDatabaseSslFlag = parseBooleanFlag(
      this.configService.get<string>('BANCO_DE_DADOS_SSL'),
    );
    const redisAuthConn = resolveRedisConnection(this.configService, 'auth');
    const redisCacheConn = resolveRedisConnection(this.configService, 'cache');
    const redisQueueConn = resolveRedisConnection(this.configService, 'queue');
    const redisAuthConfigured = Boolean(redisAuthConn);
    const redisCacheConfigured = Boolean(redisCacheConn);
    const redisQueueConfigured = Boolean(redisQueueConn);
    // Redis sem autenticação em produção expõe tokens JWT, sessions e filas
    // a qualquer processo com acesso de rede ao Redis — risco CRÍTICO.
    const redisAuthHasPassword =
      !redisAuthConn ||
      isRenderPrivateKeyValueConnection(redisAuthConn) ||
      Boolean(
        redisAuthConn.password ||
        this.configService.get<string>('REDIS_PASSWORD'),
      );
    const redisCacheHasPassword =
      !redisCacheConn ||
      isRenderPrivateKeyValueConnection(redisCacheConn) ||
      Boolean(
        redisCacheConn.password ||
        this.configService.get<string>('REDIS_PASSWORD'),
      );
    const redisQueueHasPassword =
      !redisQueueConn ||
      isRenderPrivateKeyValueConnection(redisQueueConn) ||
      Boolean(
        redisQueueConn.password ||
        this.configService.get<string>('REDIS_PASSWORD'),
      );
    const corsAllowedOrigins = this.configService.get<string>(
      'CORS_ALLOWED_ORIGINS',
    );
    const validationTokenSecret = this.configService.get<string>(
      'VALIDATION_TOKEN_SECRET',
    );
    const refreshCsrfEnforced = this.configService.get<boolean>(
      'REFRESH_CSRF_ENFORCED',
    );
    const mfaEnabled = this.configService.get<boolean>('MFA_ENABLED');
    const mfaEncryptionKey = this.configService.get<string>(
      'MFA_TOTP_ENCRYPTION_KEY',
    );
    const fieldEncryptionEnabled = this.configService.get<boolean>(
      'FIELD_ENCRYPTION_ENABLED',
    );
    const fieldEncryptionKey = this.configService.get<string>(
      'FIELD_ENCRYPTION_KEY',
    );
    const fieldEncryptionHashKey = this.configService.get<string>(
      'FIELD_ENCRYPTION_HASH_KEY',
    );
    const adminIpAllowlist =
      this.configService.get<string>('ADMIN_IP_ALLOWLIST');
    const adminIpAllowlistRequired = parseBooleanFlag(
      this.configService.get<string>('ADMIN_IP_ALLOWLIST_REQUIRED', 'true'),
    );
    const tenantBackupEncryptionKey = this.configService.get<string>(
      'TENANT_BACKUP_ENCRYPTION_KEY',
    );
    const publicValidationLegacyCompat = /^true$/i.test(
      this.configService.get<string>(
        'PUBLIC_VALIDATION_LEGACY_COMPAT',
        'false',
      ),
    );
    const rawDatabaseUrl = this.configService.get<string>('DATABASE_URL');
    const databaseHostname = resolveDatabaseHostname({ url: rawDatabaseUrl });
    const databasePoolerAllowSessionRls = this.configService.get<boolean>(
      'DATABASE_POOLER_ALLOW_SESSION_RLS',
      false,
    );

    const checks = [
      {
        name: 'JWT_SECRET',
        valid: jwtSecret && jwtSecret.length >= 32,
        message: 'JWT_SECRET deve ter no mínimo 32 caracteres',
      },
      {
        name: 'DATABASE_SSL_POLICY',
        valid:
          // SECURITY: TLS estrito em produção. Mesmo que DATABASE_SSL=false,
          // sslmode=require no DATABASE_URL ativa TLS via doesDatabaseUrlRequireSsl.
          // "Allow insecure" não é suportado pelo resolveDbSslOptions (fail-closed).
          databaseSSLAllowInsecure !== true &&
          databaseSSLAllowInsecureForce !== true &&
          (databaseSSL === true ||
            legacyDatabaseSslFlag === true ||
            doesDatabaseUrlRequireSsl(rawDatabaseUrl)),
        message:
          'TLS do banco deve ser estrito. Configure DATABASE_SSL=true (recomendado) ou use DATABASE_URL com sslmode=require. ' +
          'DATABASE_SSL_ALLOW_INSECURE/force não é suportado (fail-closed).',
      },
      {
        name: 'DATABASE_POOLER_SESSION_RLS',
        valid:
          !isNeonPoolerHost(databaseHostname) ||
          databasePoolerAllowSessionRls === true,
        message:
          'DATABASE_URL aponta para Neon -pooler, mas o SGS usa RLS por contexto de sessão. Use endpoint direto Neon ou defina DATABASE_POOLER_ALLOW_SESSION_RLS=true apenas após validar o contrato RLS.',
      },
      {
        name: 'REDIS_TIER_CONNECTIONS',
        valid:
          redisDisabled ||
          (redisAuthConfigured && redisCacheConfigured && redisQueueConfigured),
        message:
          'Configure REDIS_AUTH_URL, REDIS_CACHE_URL e REDIS_QUEUE_URL em produção, ou defina REDIS_DISABLED=true apenas fora de produção.',
      },
      {
        name: 'REDIS_AUTH_REQUIRED',
        valid:
          redisDisabled ||
          (redisAuthHasPassword &&
            redisCacheHasPassword &&
            redisQueueHasPassword),
        message:
          'Redis sem autenticação em produção expõe tokens JWT e filas. ' +
          'Configure senha via REDIS_PASSWORD ou embutida na URL (rediss://:senha@host:port).',
      },
      {
        name: 'CORS_ALLOWED_ORIGINS',
        valid: !!corsAllowedOrigins,
        message:
          'Configure CORS_ALLOWED_ORIGINS em produção com as origens explícitas do frontend',
      },
      {
        name: 'PUBLIC_VALIDATION_LEGACY_COMPAT',
        valid: publicValidationLegacyCompat === false,
        message:
          'PUBLIC_VALIDATION_LEGACY_COMPAT=true é proibido em produção. Remova o contrato legado sem token.',
      },
      {
        name: 'VALIDATION_TOKEN_SECRET',
        valid: Boolean(
          validationTokenSecret && validationTokenSecret.length >= 32,
        ),
        message:
          'Configure VALIDATION_TOKEN_SECRET com no mínimo 32 caracteres em produção.',
      },
      {
        name: 'REFRESH_CSRF_ENFORCED',
        valid: refreshCsrfEnforced === true,
        message:
          'Em produção, REFRESH_CSRF_ENFORCED deve permanecer true para proteger o fluxo /auth/refresh',
      },
      {
        name: 'MFA_TOTP_ENCRYPTION_KEY',
        // MFA_ENABLED padrão é true — exige a chave de criptografia sempre que MFA está ativo.
        // Sem essa chave, secrets TOTP são persistidos sem criptografia em repouso.
        valid:
          mfaEnabled === false ||
          Boolean(mfaEncryptionKey && mfaEncryptionKey.length >= 32),
        message:
          'MFA_TOTP_ENCRYPTION_KEY é OBRIGATÓRIA quando MFA_ENABLED=true (padrão). ' +
          'A ausência desta chave persiste segredos TOTP sem criptografia em repouso. ' +
          'Gere com: openssl rand -hex 16',
      },
      {
        name: 'FIELD_ENCRYPTION_KEY',
        valid:
          fieldEncryptionEnabled === false ||
          hasValidFieldEncryptionKey(fieldEncryptionKey),
        message:
          'FIELD_ENCRYPTION_KEY deve resolver para 32 bytes quando FIELD_ENCRYPTION_ENABLED=true em produção para proteger CPF e dados médicos em repouso.',
      },
      {
        name: 'FIELD_ENCRYPTION_HASH_KEY',
        valid:
          fieldEncryptionEnabled === false ||
          Boolean(
            fieldEncryptionHashKey &&
            fieldEncryptionHashKey.trim().length >= 32,
          ),
        message:
          'FIELD_ENCRYPTION_HASH_KEY é obrigatória em produção para hashes determinísticos de CPF sem fallback vulnerável.',
      },
      {
        name: 'ADMIN_IP_ALLOWLIST',
        valid:
          adminIpAllowlistRequired === false ||
          Boolean(adminIpAllowlist && adminIpAllowlist.trim().length > 0),
        message:
          'ADMIN_IP_ALLOWLIST é obrigatória em produção quando ADMIN_IP_ALLOWLIST_REQUIRED=true para proteger rotas /admin/*.',
      },
      {
        name: 'TENANT_BACKUP_ENCRYPTION_KEY',
        valid: Boolean(
          tenantBackupEncryptionKey &&
          tenantBackupEncryptionKey.trim().length >= 32,
        ),
        message:
          'TENANT_BACKUP_ENCRYPTION_KEY é obrigatória em produção para criptografar backups de tenant.',
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

    // Avisos de segurança (não bloqueantes — podem ser habilitados gradualmente)
    const jwtIssuer = this.configService.get<string>('JWT_ISSUER');
    const jwtAudience = this.configService.get<string>('JWT_AUDIENCE');
    if (!jwtIssuer || !jwtAudience) {
      this.logger.warn(
        'AVISO DE SEGURANÇA: JWT_ISSUER e JWT_AUDIENCE não configurados. ' +
          'Tokens emitidos sem claim binding ao emissor. ' +
          'Configure ambas as variáveis para ativar validação de issuer/audience no JwtStrategy.',
      );
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
    const legacySslEnabled = parseBooleanFlag(
      config.get<string>('BANCO_DE_DADOS_SSL'),
    );
    const databaseUrlRequiresSsl = doesDatabaseUrlRequireSsl(
      resolveDatabaseUrl(config),
    );
    const sslEnabled =
      Boolean(config.get<boolean>('DATABASE_SSL')) ||
      legacySslEnabled ||
      databaseUrlRequiresSsl;
    const sslCA = config.get<string>('DATABASE_SSL_CA');
    const allowInsecureRequested = parseBooleanFlag(
      config.get<string>('DATABASE_SSL_ALLOW_INSECURE'),
    );
    const allowInsecureForced = parseBooleanFlag(
      config.get<string>('DATABASE_SSL_ALLOW_INSECURE_FORCE'),
    );
    const allowInsecure = allowInsecureRequested || allowInsecureForced;

    if (legacySslEnabled && !config.get<boolean>('DATABASE_SSL')) {
      logger.warn(
        'BANCO_DE_DADOS_SSL=true detectado. Trate essa flag como legado e migre para DATABASE_SSL=true.',
      );
    }
    if (databaseUrlRequiresSsl && !config.get<boolean>('DATABASE_SSL')) {
      logger.log(
        '🔒 DATABASE_URL exige SSL (sslmode=require); habilitando TLS mesmo com DATABASE_SSL=false.',
      );
    }
    if (allowInsecure) {
      logger.warn(
        'DATABASE_SSL_ALLOW_INSECURE foi solicitado no backend-web, mas não é suportado. O bootstrap falhará fechado; configure DATABASE_SSL_CA e mantenha TLS estrito.',
      );
    }

    if (!isProduction && !sslEnabled && !allowInsecure) {
      logger.log('🔓 SSL desabilitado (desenvolvimento)');
      return false;
    }

    const sslOptions = resolveDbSslOptions({
      isProduction,
      sslEnabled: !!sslEnabled,
      sslCA,
      allowInsecure,
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
    consumer.apply(CsrfMiddleware).exclude('auth/csrf').forRoutes('*');

    consumer
      // CSRF clássico para access token não se aplica (Bearer no header).
      // Fluxo de refresh baseado em cookie é protegido em auth.controller.ts
      // via validação de Origin/Referer + token anti-CSRF dedicado.
      .apply(
        RequestContextMiddleware,
        SentryTraceMiddleware,
        PaginationClampMiddleware,
        TenantMiddleware,
      )
      .forRoutes('*');

    // IP allowlist para rotas administrativas — configurar ADMIN_IP_ALLOWLIST em produção
    consumer.apply(AdminIpAllowlistMiddleware).forRoutes('admin/*');
  }
}
