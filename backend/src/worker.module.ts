import { Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import * as Joi from 'joi';
import { DatabaseLogger } from './common/logging/database.logger';
import { MailModule } from './mail/mail.module';
import { ReportsModule } from './reports/reports.module';
import { QueueServicesModule } from './queue/queue-services.module';
import { ObservabilityModule } from './common/observability/observability.module';

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
  DB_POOL_MIN: Joi.number().default(1),
  DB_IDLE_TIMEOUT_MS: Joi.number().default(30000),
  DB_CONNECTION_TIMEOUT_MS: Joi.number().default(2000),
  DB_TIMINGS_ENABLED: Joi.boolean().default(false),
  OTEL_ENABLED: Joi.boolean().default(false),
  OTEL_SERVICE_NAME: Joi.string().optional(),
  OTEL_SERVICE_VERSION: Joi.string().optional(),
  JAEGER_ENDPOINT: Joi.string().optional(),
  PROMETHEUS_PORT: Joi.number().optional(),
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
        const url = config.get<string>('DATABASE_URL');
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
            min: config.get<number>('DB_POOL_MIN', 1),
            idleTimeoutMillis: config.get<number>('DB_IDLE_TIMEOUT_MS', 30000),
            connectionTimeoutMillis: config.get<number>(
              'DB_CONNECTION_TIMEOUT_MS',
              2000,
            ),
            // SECURITY: compatível com PgBouncer em modo transaction
            prepareThreshold: 0,
          },
        };
        if (url) {
          return {
            ...baseConfig,
            url,
            ssl: WorkerModule.getSSLConfig(config, isProduction, logger),
          } as any;
        }
        return {
          ...baseConfig,
          host: config.get<string>('DATABASE_HOST'),
          port: config.get<number>('DATABASE_PORT'),
          username: config.get<string>('DATABASE_USER'),
          password: config.get<string>('DATABASE_PASSWORD'),
          database: config.get<string>('DATABASE_NAME'),
          ssl: WorkerModule.getSSLConfig(config, isProduction, logger),
        } as any;
      },
    }),
    // Apenas módulos relacionados a filas/processamento
    ObservabilityModule,
    MailModule,
    ReportsModule,
    QueueServicesModule,
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
