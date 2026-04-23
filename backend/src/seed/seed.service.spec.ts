import { SeedService } from './seed.service';

type SeedServiceDeps = ConstructorParameters<typeof SeedService>;

function buildService(): SeedService {
  const deps: SeedServiceDeps = [
    {} as SeedServiceDeps[0],
    {} as SeedServiceDeps[1],
    {} as SeedServiceDeps[2],
    {} as SeedServiceDeps[3],
    {} as SeedServiceDeps[4],
    {} as SeedServiceDeps[5],
    {} as SeedServiceDeps[6],
  ];

  return new SeedService(...deps);
}

describe('SeedService', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSeedOnBootstrap = process.env.SEED_ON_BOOTSTRAP;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.SEED_ON_BOOTSTRAP = originalSeedOnBootstrap;
    jest.restoreAllMocks();
  });

  it('não agenda runSeed em NODE_ENV=test mesmo com SEED_ON_BOOTSTRAP=true', () => {
    process.env.NODE_ENV = 'test';
    process.env.SEED_ON_BOOTSTRAP = 'true';

    const service = buildService();
    const setImmediateSpy = jest.spyOn(global, 'setImmediate');

    service.onApplicationBootstrap();

    expect(setImmediateSpy).not.toHaveBeenCalled();
  });

  it('agenda runSeed fora de teste quando SEED_ON_BOOTSTRAP=true', () => {
    process.env.NODE_ENV = 'development';
    process.env.SEED_ON_BOOTSTRAP = 'true';

    const service = buildService();
    const setImmediateSpy = jest
      .spyOn(global, 'setImmediate')
      .mockImplementation(((callback: (...args: unknown[]) => void) => {
        callback();
        return {} as NodeJS.Immediate;
      }) as typeof setImmediate);
    const runSeedSpy = jest
      .spyOn(service as unknown as { runSeed: () => Promise<void> }, 'runSeed')
      .mockResolvedValue(undefined);

    service.onApplicationBootstrap();

    expect(setImmediateSpy).toHaveBeenCalledTimes(1);
    expect(runSeedSpy).toHaveBeenCalledTimes(1);
  });
});
