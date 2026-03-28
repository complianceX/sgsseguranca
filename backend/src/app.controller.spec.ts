import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RedisService } from './common/redis/redis.service';

type RedisClientMock = {
  ping: jest.Mock<Promise<string>, []>;
};

type DataSourceMock = Pick<
  DataSource,
  'isInitialized' | 'query' | 'showMigrations'
>;

describe('AppController', () => {
  let appController: AppController;
  let dataSource: DataSourceMock;
  let redisClient: RedisClientMock;
  let configService: { get: jest.Mock<string, [string, string?]> };

  beforeEach(async () => {
    dataSource = {
      isInitialized: true,
      query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
      showMigrations: jest.fn().mockResolvedValue(false),
    };

    redisClient = {
      ping: jest.fn<Promise<string>, []>().mockResolvedValue('PONG'),
    };

    configService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        if (key === 'NODE_ENV') return 'production';
        if (key === 'REDIS_DISABLED') return 'true';
        if (key === 'REQUIRE_NO_PENDING_MIGRATIONS') return 'false';
        return defaultValue ?? '';
      }),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: ConfigService, useValue: configService },
        { provide: DataSource, useValue: dataSource },
        {
          provide: RedisService,
          useValue: {
            getClient: () => redisClient,
          } satisfies Pick<RedisService, 'getClient'>,
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  it('deve retornar o texto raiz da API', () => {
    expect(appController.getHello()).toBe('Hello World!');
  });

  it('deve retornar health/public simples sem depender de infraestrutura', () => {
    const result = appController.publicHealthCheck();

    expect(result.status).toBe('ok');
  });

  it('deve retornar readiness ok quando banco estiver de pé e redis estiver desabilitado', async () => {
    const result = await appController.healthCheck();

    expect(result.status).toBe('ok');
  });

  it('deve retornar degraded quando o banco não estiver inicializado', async () => {
    dataSource.isInitialized = false;

    await expect(appController.healthCheck()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('deve retornar readiness ok mesmo sem dependência de worker', async () => {
    configService.get.mockImplementation(
      (key: string, defaultValue?: string) => {
        if (key === 'NODE_ENV') return 'production';
        if (key === 'REDIS_DISABLED') return 'false';
        if (key === 'REQUIRE_NO_PENDING_MIGRATIONS') return 'false';
        return defaultValue ?? '';
      },
    );
    redisClient.ping.mockResolvedValue('PONG');

    await expect(appController.healthCheck()).resolves.toMatchObject({
      status: 'ok',
    });
  });
});
