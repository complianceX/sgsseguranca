import { UnauthorizedException } from '@nestjs/common';
import { TenantValidationService } from './tenant-validation.service';

type MockCompanyRepo = {
  find: jest.Mock;
  findOne: jest.Mock;
};

describe('TenantValidationService', () => {
  let companiesRepository: MockCompanyRepo;
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
      get: jest.fn(async (key: string) => cacheStore.get(key)),
      set: jest.fn(async (key: string, value: unknown) => {
        cacheStore.set(key, value);
      }),
    };

    service = new TenantValidationService(
      companiesRepository as never,
      cacheManager as never,
    );
  });

  it('deduplica validações concorrentes do mesmo tenant', async () => {
    companiesRepository.findOne.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ id: '22532924-055c-41a0-b0b2-20ca91a71b31' }), 10),
        ),
    );

    await Promise.all([
      service.assertTenantIsValid('22532924-055c-41a0-b0b2-20ca91a71b31'),
      service.assertTenantIsValid('22532924-055c-41a0-b0b2-20ca91a71b31'),
      service.assertTenantIsValid('22532924-055c-41a0-b0b2-20ca91a71b31'),
    ]);

    expect(companiesRepository.findOne).toHaveBeenCalledTimes(1);
    expect(cacheManager.set).toHaveBeenCalledTimes(1);
  });

  it('reutiliza cache local quente sem consultar o banco', async () => {
    companiesRepository.findOne.mockResolvedValue({
      id: '22532924-055c-41a0-b0b2-20ca91a71b31',
    });

    await service.assertTenantIsValid('22532924-055c-41a0-b0b2-20ca91a71b31');
    await service.assertTenantIsValid('22532924-055c-41a0-b0b2-20ca91a71b31');

    expect(companiesRepository.findOne).toHaveBeenCalledTimes(1);
  });

  it('faz warmup dos tenants ativos recentes', async () => {
    companiesRepository.find.mockResolvedValue([
      { id: '22532924-055c-41a0-b0b2-20ca91a71b31' },
      { id: 'afdf7dd1-38b0-445f-9745-b5f6341143a9' },
    ]);

    service.onApplicationBootstrap();
    await new Promise((resolve) => setTimeout(resolve, 1100));

    expect(companiesRepository.find).toHaveBeenCalledTimes(1);
    expect(cacheManager.set).toHaveBeenCalledTimes(2);
  });

  it('falha fechado para tenant inválido', async () => {
    await expect(service.assertTenantIsValid('tenant-invalido')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(companiesRepository.findOne).not.toHaveBeenCalled();
  });
});
