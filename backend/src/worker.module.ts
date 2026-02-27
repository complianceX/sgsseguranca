import { Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import * as Joi from 'joi';
import { DatabaseLogger } from './common/logging/database.logger';
import { MailModule } from './mail/mail.module';
import { ReportsModule } from './reports/reports.module';
import { QueueServicesModule } from './queue/queue-services.module';

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
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const logger = new Logger('WorkerBullModule');
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
        if (isProduction && config.get<boolean>('REDIS_TLS')) {
          (redisConfig as any).tls = {};
        }
        return { redis: redisConfig };
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
            max: 20,
            min: 5,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
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
    if (!isProduction) {
      return false;
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
