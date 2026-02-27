import {
  Module,
  MiddlewareConsumer,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import * as Joi from 'joi';
import * as redisStore from 'cache-manager-redis-store';
import type { RedisClientOptions } from 'redis';

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
// import { DocumentImportModule } from './document-import/document-import.module';
import { AuditModule } from './audit/audit.module';
import { TasksModule } from './tasks/tasks.module';
// import { NotificationsModule } from './notifications/notifications.module';
import { PushModule } from './push/push.module';
import { DataLoaderModule } from './common/dataloader/dataloader.module';
import { MathModule } from './math/math.module';
import { RedisModule } from './common/redis/redis.module';

// Guards, Interceptors & Middleware
import { IpThrottlerGuard } from './common/guards/ip-throttler.guard';
import { TenantRequiredGuard } from './common/guards/tenant-required.guard';
import { TenantInterceptor } from './common/tenant/tenant.interceptor';
import { TenantMiddleware } from './common/middleware/tenant.middleware';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { DatabaseLogger } from './common/logging/database.logger';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';
import { CsrfMiddleware } from './common/middleware/csrf.middleware';

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
  REDIS_HOST: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.string().default('127.0.0.1'),
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
  JAEGER_AGENT_HOST: Joi.string().optional(),
  JAEGER_AGENT_PORT: Joi.number().optional(),
  PROMETHEUS_PORT: Joi.number().optional(),
  ANTHROPIC_API_KEY: Joi.string().optional(),
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
      useFactory: async (config: ConfigService) => {
        const isProduction = config.get('NODE_ENV') === 'production';
        const logger = new Logger('CacheModule');

        if (isProduction) {
          logger.log('🔴 Configurando Redis Cache para PRODUÇÃO');

          const redisConfig = {
            store: redisStore as any,
            host: config.get<string>('REDIS_HOST'),
            port: config.get<number>('REDIS_PORT'),
            password: config.get<string>('REDIS_PASSWORD'),
            ttl: 300, // 5 minutos default
            max: 1000, // Máximo de itens no cache
          };

          // TLS para Redis em produção (se configurado)
          if (config.get<boolean>('REDIS_TLS')) {
            logger.log('🔒 Redis TLS habilitado');
            (redisConfig as any).tls = {};
          }

          return redisConfig;
        }

        logger.log('💾 Configurando Memory Cache para DESENVOLVIMENTO');
        return {
          ttl: 300,
          max: 100,
        };
      },
    }),

    // 5. BullModule para filas com Redis
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const logger = new Logger('BullModule');
        const isProduction = config.get('NODE_ENV') === 'production';

        const redisConfig = {
          host: config.get<string>('REDIS_HOST'),
          port: config.get<number>('REDIS_PORT'),
          password: config.get<string>('REDIS_PASSWORD'),
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
          retryStrategy: (times: number) => {
            const delay = Math.min(times * 50, 2000);
            logger.warn(`Redis reconnect attempt ${times}, delay: ${delay}ms`);
            return delay;
          },
        };

        // TLS para Redis em produção
        if (isProduction && config.get<boolean>('REDIS_TLS')) {
          logger.log('🔒 Bull Redis TLS habilitado');
          (redisConfig as any).tls = {};
        }

        logger.log(
          `📬 Bull conectando ao Redis: ${redisConfig.host}:${redisConfig.port}`,
        );

        return {
          redis: redisConfig,
          defaultJobOptions: {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 1000,
            },
            removeOnComplete: 100, // Manter últimos 100 jobs completos
            removeOnFail: 500, // Manter últimos 500 jobs falhados
          },
        };
      },
    }),

    // 6. TypeORM com configuração segura de SSL
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const logger = new Logger('TypeORM');
        const isProduction = config.get('NODE_ENV') === 'production';
        const url = config.get<string>('DATABASE_URL');

        // Configuração base
        const baseConfig = {
          type: 'postgres' as const,
          autoLoadEntities: true,
          synchronize: false, // NUNCA true em produção
          logger: new DatabaseLogger(),
          logging: isProduction
            ? (['error', 'warn'] as const)
            : (['error', 'warn', 'query'] as const),
          maxQueryExecutionTime: 1000, // Log queries > 1s

          // Connection pooling otimizado
          extra: {
            max: 20, // Máximo de conexões
            min: 5, // Mínimo de conexões
            idleTimeoutMillis: 30000, // 30s
            connectionTimeoutMillis: 2000, // 2s timeout
            // SECURITY: compatível com PgBouncer em modo transaction
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
          } as any;
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
        } as any;
      },
    }),

    // Feature Modules
    TasksModule,
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
    ReportsModule,
    MailModule,
    SignaturesModule,
    AuditsModule,
    InspectionsModule,
    NonConformitiesModule,
    // DocumentImportModule,
    AuditModule,
    DataLoaderModule,
    MathModule,
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
      useClass: TenantRequiredGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
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
  async onModuleInit() {
    const isProduction = this.configService.get('NODE_ENV') === 'production';

    this.logger.log('🚀 Inicializando AppModule...');
    this.logger.log(`📍 Ambiente: ${this.configService.get('NODE_ENV')}`);

    if (isProduction) {
      this.logger.log('🔒 Validando configurações de PRODUÇÃO...');
      this.validateProductionSecurity();
    } else {
      this.logger.warn('⚠️  Ambiente de DESENVOLVIMENTO detectado');
    }

    this.logger.log('✅ AppModule inicializado com sucesso');
  }

  /**
   * 🔒 VALIDAÇÃO DE SEGURANÇA EM PRODUÇÃO
   *
   * Verifica se todas as configurações críticas estão corretas.
   */
  private validateProductionSecurity() {
    const jwtSecret = this.configService.get<string>('JWT_SECRET');
    const databaseSSL = this.configService.get<boolean>('DATABASE_SSL');
    const redisHost = this.configService.get<string>('REDIS_HOST');
    const mailHost = this.configService.get<string>('MAIL_HOST');

    const checks = [
      {
        name: 'JWT_SECRET',
        valid: jwtSecret && jwtSecret.length >= 32,
        message: 'JWT_SECRET deve ter no mínimo 32 caracteres',
      },
      {
        name: 'DATABASE_SSL',
        valid: databaseSSL === true,
        message: 'DATABASE_SSL deve estar habilitado em produção',
      },
      {
        name: 'REDIS_HOST',
        valid: !!redisHost,
        message: 'REDIS_HOST é obrigatório em produção',
      },
      {
        name: 'MAIL_HOST',
        valid: !!mailHost,
        message: 'MAIL_HOST é obrigatório',
      },
    ];

    const failures = checks.filter((check) => !check.valid);

    if (failures.length > 0) {
      this.logger.error('❌ FALHAS DE SEGURANÇA DETECTADAS:');
      failures.forEach((failure) => {
        this.logger.error(`   - ${failure.name}: ${failure.message}`);
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

    if (!isProduction) {
      logger.log('🔓 SSL desabilitado (desenvolvimento)');
      return false;
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
      .apply(RequestContextMiddleware, TenantMiddleware, CsrfMiddleware)
      .forRoutes('*');
  }
}
