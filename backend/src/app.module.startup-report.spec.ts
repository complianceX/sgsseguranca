import { ConfigService } from '@nestjs/config';

describe('AppModule startup report', () => {
  const originalEnv = process.env;
  const fakeDatabaseUrl = [
    'postgresql://',
    'sgs_app',
    ':',
    'placeholder',
    '@',
    'ep-example.sa-east-1.aws.neon.tech',
    '/neondb',
  ].join('');

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'development',
      DATABASE_URL: fakeDatabaseUrl,
      JWT_SECRET: 'a'.repeat(32),
      JWT_REFRESH_SECRET: 'b'.repeat(32),
      REDIS_DISABLED: 'true',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.resetModules();
  });

  it('registra linha única com estado efetivo de refresh CSRF', async () => {
    const imported = (await import('./app.module')) as unknown as {
      AppModule: new (configService: ConfigService) => unknown;
    };

    const configService = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        if (key === 'NODE_ENV') return 'development';
        if (key === 'SECURITY_HARDENING_PHASE') return 'phase-x';
        if (key === 'REFRESH_CSRF_ENFORCED') return false;
        if (key === 'REFRESH_CSRF_REPORT_ONLY') return true;
        return defaultValue;
      }),
    } as unknown as ConfigService;

    const appModule = new imported.AppModule(configService) as {
      onModuleInit: () => void;
      logger: { log: (msg: string) => void; warn: (msg: string) => void };
    };
    const logSpy = jest
      .spyOn(appModule.logger, 'log')
      .mockImplementation(() => undefined);
    const warnSpy = jest
      .spyOn(appModule.logger, 'warn')
      .mockImplementation(() => undefined);

    appModule.onModuleInit();

    expect(logSpy).toHaveBeenCalledWith(
      '🛡️ Refresh CSRF state: enforced=false reportOnly=true mode=report_only',
    );
    expect(warnSpy).toHaveBeenCalled();
  });
});
