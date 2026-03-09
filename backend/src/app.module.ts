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
import { CalendarModule } from './calendar/calendar.module';
// QueueServicesModule removido do AppModule — registra as mesmas filas que
// MailModule/ReportsModule/TasksModule, causando conflito de DI no NestJS.
// Fica apenas no WorkerModule onde tem acesso completo a todas as filas.

// Guards, Interceptors & Middleware
import { IpThrottlerGuard } from './common/guards/ip-throttler.guard';
import { TenantGuard } from './common/guards/tenant.guard';
import { TenantRateLimitGuard } from './common/guards/tenant-rate-limit.guard';
import { TenantMiddleware } from './common/middleware/tenant.middleware';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { IdempotencyInterceptor } from './common/idempotency/idempotency.interceptor';
import { IdempotencyService } from './common/idempotency/idempotency.service';
import { TimeoutInterceptor } from './common/interceptors/timeout.interceptor';
import { MetricsInterceptor } from './common/interceptors/metrics.interceptor';
import { DatabaseLogger } from './common/logging/database.logger';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';

const isRedisDisabled = /^true$/i.test(process.env.REDIS_DISABLED || '');
const queueBackedModules = isRedisDisabled
  ? []
  : [TasksModule, ReportsModule, MailModule];
const queueInfraModules = isRedisDisabled
  ? []
  : [
      BullModule.forRoot(
        (() => {
          const redisUrl =
            process.env.REDIS_URL ||
            process.env.URL_REDIS ||
            process.env.REDIS_PUBLIC_URL;

          if (redisUrl) {
            const parsed = new URL(redisUrl);
            return {
              connection: {
                host: parsed.hostname,
                port: Number(parsed.port || 6379),
                username: parsed.username
                  ? decodeURIComponent(parsed.username)
                  : undefined,
                password: parsed.password
                  ? decodeURIComponent(parsed.password)
                  : undefined,
                tls:
                  parsed.protocol === 'rediss:'
                    ? { rejectUnauthorized: false }
                    : undefined,
                connectTimeout: 10_000,
                enableReadyCheck: false,
                maxRetriesPerRequest: 1,
                retryStrategy: () => undefined,
              },
            };
          }

          return {
            connection: {
              host: process.env.REDIS_HOST,
              port: Number(process.env.REDIS_PORT),
              password: process.env.REDIS_PASSWORD,
              tls:
                process.env.REDIS_TLS === 'true'
                  ? { rejectUnauthorized: false }
                  : undefined,
              connectTimeout: 10_000,
              enableReadyCheck: false,
              maxRetriesPerRequest: 1,
              retryStrategy: () => undefined,
            },
          };
        })(),
      ),
    ];

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
  DATABASE_URL: Joi.string().optional(),
  DATABASE_HOST: Joi.string().when('DATABASE_URL', {
    is: Joi.exist(),
    then: Joi.optional(),
    otherwise: Joi.required(),
  }),
  DATABASE_PORT: Joi.number().default(5432),
  DATABASE_USER: Joi.string().when('DATABASE_URL', {
    is: Joi.exist(),
    then: Joi.optional(),
    otherwise: Joi.required(),
  }),
  DATABASE_PASSWORD: Joi.string().when('DATABASE_URL', {
    is: Joi.exist(),
    then: Joi.optional(),
    otherwise: Joi.required(),
  }),
  DATABASE_NAME: Joi.string().when('DATABASE_URL', {
    is: Joi.exist(),
    then: Joi.optional(),
    otherwise: Joi.required(),
  }),
  DATABASE_SSL: Joi.boolean().default(false),
  DATABASE_SSL_CA: Joi.string().optional(),
  REDIS_URL: Joi.string().optional(),
  REDIS_HOST: Joi.string().when('REDIS_URL', {
    is: Joi.exist(),
    then: Joi.optional(),
    otherwise: Joi.string().when('NODE_ENV', {
      is: 'production',
      then: Joi.required(),
      otherwise: Joi.string().default('127.0.0.1'),
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
  JAEGER_AGENT_HOST: Joi.string().optional(),
  JAEGER_AGENT_PORT: Joi.number().optional(),
  PROMETHEUS_PORT: Joi.number().optional(),
  AI_PROVIDER: Joi.string().valid('anthropic', 'gemini', 'stub').optional(),
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
}).custom((value, helpers) => {
  const bypassEnabled = value.DEV_LOGIN_BYPASS === true;
  const explicitlyAllowed = value.ALLOW_DEV_LOGIN_BYPASS === true;
  const isLocalDev = value.NODE_ENV === 'development';

  if (bypassEnabled && (!isLocalDev || !explicitlyAllowed)) {
    return helpers.error('any.invalid', {
      message:
        'DEV_LOGIN_BYPASS só é permitido em NODE_ENV=development com ALLOW_DEV_LOGIN_BYPASS=true',
    });
  }

  return value;
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

    // 3. ThrottlerModule para rate limiting
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('THROTTLE_TTL', 60000),
          limit: config.get<number>('THROTTLE_LIMIT', 100),
        },
      ],
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
        const hasRedisUrl = !!(
          config.get<string>('REDIS_URL') ||
          config.get<string>('URL_REDIS') ||
          config.get<string>('REDIS_PUBLIC_URL')
        );

        if (isProduction && !redisDisabled && hasRedisUrl) {
          logger.log('🔴 Configurando Redis Cache para PRODUÇÃO');

          const redisConfig: RedisCacheConfig = {
            store: redisStore as unknown,
            host: config.get<string>('REDIS_HOST')!,
            port: config.get<number>('REDIS_PORT')!,
            password: config.get<string>('REDIS_PASSWORD'),
            ttl: 300, // 5 minutos default
            max: 1000, // Máximo de itens no cache
          };

          // TLS para Redis em produção (se configurado)
          if (config.get<boolean>('REDIS_TLS')) {
            logger.log('🔒 Redis TLS habilitado');
            redisConfig.tls = {};
          }

          return redisConfig as unknown as RedisClientOptions;
        }

        if (isProduction && redisDisabled) {
          logger.warn(
            '⚠️ REDIS_DISABLED=true: usando Memory Cache em produção',
          );
        } else if (isProduction && !hasRedisUrl) {
          logger.warn(
            '⚠️ Redis URL ausente: usando Memory Cache em produção',
          );
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
        const dbType = config.get<'postgres' | 'sqlite'>('DATABASE_TYPE', 'postgres');
        const url = config.get<string>('DATABASE_URL');
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
          logger.log('🔗 Conectando via DATABASE_URL');

          return {
            ...baseConfig,
            url,
            ssl: AppModule.getSSLConfig(config, isProduction, logger),
          };
        }

        // Conexão via variáveis individuais
        const host = config.get<string>('DATABASE_HOST');
        const port = config.get<number>('DATABASE_PORT');

        logger.log(`🔗 Conectando ao PostgreSQL: ${host}:${port}`);

        return {
          ...baseConfig,
          host,
          port,
          username: config.get<string>('DATABASE_USER'),
          password: config.get<string>('DATABASE_PASSWORD'),
          database: config.get<string>('DATABASE_NAME'),
          ssl: AppModule.getSSLConfig(config, isProduction, logger),
        };
      },

      /**
       * Lazy DataSource: HTTP sobe imediatamente mesmo se DB estiver indisponível.
       * A conexão é estabelecida em background com retry exponencial.
       * Requests que precisam do DB recebem erro até a conexão estar pronta.
       */
      dataSourceFactory: async (options) => {
        const dsLogger = new Logger('LazyDataSource');
        const dataSource = new DataSource(options!);

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
              await new Promise<void>((resolve) => setTimeout(resolve, delay));
            }
          }
        };

        void connectWithRetry();
        return dataSource;
      },
    }),

    // Feature Modules
    ...queueBackedModules,
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
    CalendarModule,
  ],
  controllers: [AppController],
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
        '⚠️ REDIS_DISABLED=true: módulos de fila (mail/reports/tasks) estão desabilitados neste runtime.',
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
    const databaseUrl = this.configService.get<string>('DATABASE_URL');
    const railwaySelfSigned =
      this.configService.get<string>('BANCO_DE_DADOS_SSL') === 'true';
    const redisHost = this.configService.get<string>('REDIS_HOST');
    const redisUrl =
      this.configService.get<string>('REDIS_URL') ||
      this.configService.get<string>('URL_REDIS') ||
      this.configService.get<string>('REDIS_PUBLIC_URL');
    //

    const checks = [
      {
        name: 'JWT_SECRET',
        valid: jwtSecret && jwtSecret.length >= 32,
        message: 'JWT_SECRET deve ter no mínimo 32 caracteres',
      },
      {
        name: 'DATABASE_SSL',
        valid:
          databaseSSL === true ||
          railwaySelfSigned === true ||
          !!databaseUrl,
        message:
          'Configure DATABASE_URL (Railway) ou habilite DATABASE_SSL/BANCO_DE_DADOS_SSL em produção',
      },
      {
        name: 'REDIS_CONNECTION',
        valid: redisDisabled || !!redisUrl || !!redisHost,
        message:
          'Configure REDIS_URL (recomendado) ou REDIS_HOST em produção, ou defina REDIS_DISABLED=true',
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
    const databaseUrl = config.get<string>('DATABASE_URL');
    const railwaySelfSigned =
      config.get<string>('BANCO_DE_DADOS_SSL') === 'true';

    if (!isProduction) {
      logger.log('🔓 SSL desabilitado (desenvolvimento)');
      return false;
    }

    // Railway: certificado self-signed interno
    if (railwaySelfSigned) {
      logger.warn(
        '⚠️  SSL com rejectUnauthorized:false habilitado (Railway self-signed)',
      );
      return { rejectUnauthorized: false };
    }

    if (databaseUrl && !sslCA) {
      logger.warn(
        '⚠️  DATABASE_URL detectada sem CA customizado — usando rejectUnauthorized:false (Railway compat)',
      );
      return { rejectUnauthorized: false };
    }

    if (!sslEnabled) {
      logger.warn('⚠️  SSL desabilitado em PRODUÇÃO - NÃO RECOMENDADO');
      return false;
    }

    // SSL com certificado CA customizado
    if (sslCA) {
      logger.log('🔒 SSL habilitado com CA customizado');
      return {
        rejectUnauthorized: true,
        ca: sslCA,
      };
    }

    // SSL padrão (Railway, Heroku, AWS RDS)
    logger.log('🔒 SSL habilitado (validação padrão)');
    return {
      rejectUnauthorized: true,
    };
  }

  /**
   * Configuração de middlewares
   */
  configure(consumer: MiddlewareConsumer) {
    consumer
      // CSRF: removido. Modelo oficial: Authorization Bearer (access token) + refresh token httpOnly cookie.
      // Sem cookie de auth principal, CSRF não se aplica ao fluxo principal.
      .apply(RequestContextMiddleware, TenantMiddleware)
      .forRoutes('*');
  }
}
