import { UnauthorizedException } from '@nestjs/common';
import { TenantValidationService } from './tenant-validation.service';

type MockCompanyRepo = {
  find: jest.Mock;
  findOne: jest.Mock;
};

describe('TenantValidationService', () => {
  let companiesRepository: MockCompanyRepo;
  let queryRunner: {
    connect: jest.Mock;
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
    query: jest.Mock;
  };
  let dataSource: { createQueryRunner: jest.Mock };
  let cacheStore: Map<string, unknown>;
  let cacheManager: { get: jest.Mock; set: jest.Mock };
  let service: TenantValidationService;

  beforeEach(() => {
    companiesRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
    };
    cacheStore = new Map<string, unknown>();
    cacheManager = {
      get: jest.fn((key: string) => Promise.resolve(cacheStore.get(key))),
      set: jest.fn((key: string, value: unknown) => {
        cacheStore.set(key, value);
        return Promise.resolve(undefined);
      }),
    };
    queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      query: jest.fn(),
    };
    dataSource = {
      createQueryRunner: jest.fn(() => queryRunner),
    };

    service = new TenantValidationService(
      companiesRepository as never,
      cacheManager as never,
      dataSource as never,
    );
  });

  it('deduplica validações concorrentes do mesmo tenant', async () => {
    queryRunner.query
      .mockResolvedValueOnce(undefined)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve([{ id: '22532924-055c-41a0-b0b2-20ca91a71b31' }]),
              10,
            ),
          ),
      );

    await Promise.all([
      service.assertTenantIsValid('22532924-055c-41a0-b0b2-20ca91a71b31'),
      service.assertTenantIsValid('22532924-055c-41a0-b0b2-20ca91a71b31'),
      service.assertTenantIsValid('22532924-055c-41a0-b0b2-20ca91a71b31'),
    ]);

    expect(dataSource.createQueryRunner).toHaveBeenCalledTimes(1);
    expect(cacheManager.set).toHaveBeenCalledTimes(1);
  });

  it('reutiliza cache local quente sem consultar o banco', async () => {
    queryRunner.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([
        { id: '22532924-055c-41a0-b0b2-20ca91a71b31' },
      ]);

    await service.assertTenantIsValid('22532924-055c-41a0-b0b2-20ca91a71b31');
    await service.assertTenantIsValid('22532924-055c-41a0-b0b2-20ca91a71b31');

    expect(dataSource.createQueryRunner).toHaveBeenCalledTimes(1);
  });

  it('faz warmup dos tenants ativos recentes', async () => {
    queryRunner.query.mockResolvedValueOnce(undefined).mockResolvedValueOnce([
      { id: '22532924-055c-41a0-b0b2-20ca91a71b31' },
      { id: 'afdf7dd1-38b0-445f-9745-b5f6341143a9' },
    ]);

    process.env.TENANT_VALIDATION_WARMUP_DELAY_MS = '10';
    service.onApplicationBootstrap();
    await new Promise((resolve) => setTimeout(resolve, 1100));
    delete process.env.TENANT_VALIDATION_WARMUP_DELAY_MS;

    expect(dataSource.createQueryRunner).toHaveBeenCalledTimes(1);
    expect(cacheManager.set).toHaveBeenCalledTimes(2);
  });

  it('falha fechado para tenant inválido', async () => {
    await expect(
      service.assertTenantIsValid('tenant-invalido'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
  });
});
