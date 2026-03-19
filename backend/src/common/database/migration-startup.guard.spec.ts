import appDataSource from '../../data-source';
import {
  assertNoPendingMigrationsInProd,
  shouldRequireNoPendingMigrations,
} from './migration-startup.guard';

jest.mock('../../data-source', () => ({
  __esModule: true,
  default: {
    isInitialized: false,
    initialize: jest.fn(),
    showMigrations: jest.fn(),
    destroy: jest.fn(),
  },
}));

describe('assertNoPendingMigrationsInProd', () => {
  const originalEnv = process.env;
  const mockedDataSource = appDataSource as unknown as {
    isInitialized: boolean;
    initialize: jest.Mock;
    showMigrations: jest.Mock;
    destroy: jest.Mock;
  };

  beforeEach(() => {
    process.env = { ...originalEnv };
    mockedDataSource.isInitialized = false;
    mockedDataSource.initialize.mockImplementation(() => {
      mockedDataSource.isInitialized = true;
    });
    mockedDataSource.showMigrations.mockResolvedValue(false);
    mockedDataSource.destroy.mockImplementation(() => {
      mockedDataSource.isInitialized = false;
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  it('ignora a verificação fora de produção', async () => {
    process.env.NODE_ENV = 'development';

    await expect(assertNoPendingMigrationsInProd()).resolves.toBeUndefined();

    expect(mockedDataSource.initialize).not.toHaveBeenCalled();
  });

  it('falha por padrão em produção quando há migrations pendentes', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/app';
    mockedDataSource.showMigrations.mockResolvedValue(true);

    await expect(assertNoPendingMigrationsInProd()).rejects.toThrow(
      'Pending database migrations detected.',
    );

    expect(mockedDataSource.initialize).toHaveBeenCalledTimes(1);
    expect(mockedDataSource.destroy).toHaveBeenCalledTimes(1);
  });

  it('permite opt-out explícito em produção', async () => {
    process.env.NODE_ENV = 'production';
    process.env.REQUIRE_NO_PENDING_MIGRATIONS = 'false';

    await expect(assertNoPendingMigrationsInProd()).resolves.toBeUndefined();

    expect(mockedDataSource.initialize).not.toHaveBeenCalled();
  });

  it('exige migrations por padrão em produção mesmo sem flag explícita', () => {
    expect(
      shouldRequireNoPendingMigrations({
        NODE_ENV: 'production',
      } as NodeJS.ProcessEnv),
    ).toBe(true);
  });

  it('não exige migrations fora de produção', () => {
    expect(
      shouldRequireNoPendingMigrations({
        NODE_ENV: 'development',
      } as NodeJS.ProcessEnv),
    ).toBe(false);
  });
});
