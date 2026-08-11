import type { ConfigService } from '@nestjs/config';
import type { DataSource, EntityManager } from 'typeorm';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import {
  ProvisioningDataSourceService,
  buildProvisioningDataSourceOptions,
} from './provisioning-datasource.service';

type MutableOptions = Record<string, unknown>;

describe('buildProvisioningDataSourceOptions', () => {
  const base = {
    type: 'postgres',
    url: 'postgresql://sgs_app:senha@runtime.neon.tech/neondb?sslmode=require',
    ssl: { rejectUnauthorized: true },
    synchronize: false,
    extra: { max: 10, min: 2, application_name: 'api_web', keepAlive: true },
  } as unknown as PostgresConnectionOptions;

  const build = (overrides: Partial<PostgresConnectionOptions> = {}) =>
    buildProvisioningDataSourceOptions({
      base: { ...base, ...overrides },
      adminUrl: 'postgresql://sgs_admin:outra@admin.neon.tech/neondb',
      entities: [class Alfa {}, class Beta {}],
      poolMax: 3,
    }) as unknown as MutableOptions;

  it('usa a URL administrativa, não a de runtime', () => {
    expect(build().url).toBe(
      'postgresql://sgs_admin:outra@admin.neon.tech/neondb',
    );
  });

  it('limpa host/port/username/password/database herdados', () => {
    // Se a conexão de runtime foi configurada por variáveis individuais, herdar
    // qualquer um desses campos faria o `url` ser ignorado pelo driver e a
    // conexão autenticaria como sgs_app — sem erro, e sem bypass.
    const options = build({
      url: undefined,
      host: 'runtime.neon.tech',
      port: 5432,
      username: 'sgs_app',
      password: 'senha',
      database: 'neondb',
    });

    expect(options.host).toBeUndefined();
    expect(options.port).toBeUndefined();
    expect(options.username).toBeUndefined();
    expect(options.password).toBeUndefined();
    expect(options.database).toBeUndefined();
    expect(options.url).toBe(
      'postgresql://sgs_admin:outra@admin.neon.tech/neondb',
    );
  });

  it('NÃO herda a réplica de leitura', () => {
    // A réplica autentica como sgs_app. Herdada aqui, todo SELECT do
    // provisionamento voltaria para a conexão sem bypass e devolveria 0 linhas.
    const options = build({
      replication: {
        master: { url: 'postgresql://sgs_app:senha@master/neondb' },
        slaves: [{ url: 'postgresql://sgs_app:senha@replica/neondb' }],
      },
    });

    expect(options.replication).toBeUndefined();
  });

  it('preserva a configuração de SSL da conexão de runtime', () => {
    expect(build().ssl).toEqual({ rejectUnauthorized: true });
  });

  it('repassa as entidades recebidas', () => {
    expect(build().entities).toHaveLength(2);
  });

  it('nunca roda migrations nem sincroniza schema', () => {
    const options = build({
      synchronize: true,
    });
    expect(options.migrations).toEqual([]);
    expect(options.migrationsRun).toBe(false);
    expect(options.synchronize).toBe(false);
  });

  it('usa pool próprio e application_name identificável', () => {
    const extra = build().extra as Record<string, unknown>;
    expect(extra.max).toBe(3);
    expect(extra.min).toBe(0);
    expect(extra.application_name).toBe('api_provisioning');
    // O resto do `extra` (keepAlive etc) continua herdado.
    expect(extra.keepAlive).toBe(true);
  });
});

describe('ProvisioningDataSourceService', () => {
  const makeRuntime = (type: 'postgres' | 'better-sqlite3' = 'postgres') => {
    const manager = { query: jest.fn(() => Promise.resolve(undefined)) };
    const runtime = {
      options: { type },
      entityMetadatas: [],
      transaction: jest.fn((callback: (m: unknown) => unknown) =>
        Promise.resolve(callback(manager)),
      ),
    };
    return { runtime, manager };
  };

  const makeConfig = (values: Record<string, string> = {}) =>
    ({
      get: jest.fn((key: string) => values[key]),
    }) as unknown as ConfigService;

  describe('isDedicated', () => {
    it('é falso sem DATABASE_ADMIN_URL', () => {
      const { runtime } = makeRuntime();
      const service = new ProvisioningDataSourceService(
        makeConfig(),
        runtime as unknown as DataSource,
      );
      expect(service.isDedicated()).toBe(false);
    });

    it('é falso quando a URL vem em branco', () => {
      const { runtime } = makeRuntime();
      const service = new ProvisioningDataSourceService(
        makeConfig({ DATABASE_ADMIN_URL: '   ' }),
        runtime as unknown as DataSource,
      );
      expect(service.isDedicated()).toBe(false);
    });

    it('é falso em SQLite mesmo com a URL setada', () => {
      // Sem RLS não há o que contornar, e clonar opções de sqlite com uma URL
      // de postgres quebraria a conexão.
      const { runtime } = makeRuntime('better-sqlite3');
      const service = new ProvisioningDataSourceService(
        makeConfig({ DATABASE_ADMIN_URL: 'postgresql://sgs_admin@host/db' }),
        runtime as unknown as DataSource,
      );
      expect(service.isDedicated()).toBe(false);
    });

    it('é verdadeiro com URL setada e runtime PostgreSQL', () => {
      const { runtime } = makeRuntime();
      const service = new ProvisioningDataSourceService(
        makeConfig({ DATABASE_ADMIN_URL: 'postgresql://sgs_admin@host/db' }),
        runtime as unknown as DataSource,
      );
      expect(service.isDedicated()).toBe(true);
    });
  });

  describe('transaction (fallback para a conexão de runtime)', () => {
    it('roda o callback e seta a flag de super admin', async () => {
      const { runtime, manager } = makeRuntime();
      const service = new ProvisioningDataSourceService(
        makeConfig(),
        runtime as unknown as DataSource,
      );

      const resultado = await service.transaction((m) => {
        expect(m).toBe(manager as unknown as EntityManager);
        return Promise.resolve('ok');
      });

      expect(resultado).toBe('ok');
      expect(runtime.transaction).toHaveBeenCalledTimes(1);
      expect(manager.query).toHaveBeenCalledWith(
        "SET LOCAL app.is_super_admin = 'true'",
      );
    });

    it('seta a flag ANTES de executar o callback', async () => {
      const { runtime, manager } = makeRuntime();
      const service = new ProvisioningDataSourceService(
        makeConfig(),
        runtime as unknown as DataSource,
      );

      let flagJaSetada = false;
      await service.transaction(() => {
        flagJaSetada = manager.query.mock.calls.length > 0;
        return Promise.resolve();
      });

      expect(flagJaSetada).toBe(true);
    });

    it('avisa uma única vez que está sem a conexão dedicada', async () => {
      const { runtime } = makeRuntime();
      const service = new ProvisioningDataSourceService(
        makeConfig(),
        runtime as unknown as DataSource,
      );
      const warn = jest
        .spyOn(
          (service as unknown as { logger: { warn: (v: unknown) => void } })
            .logger,
          'warn',
        )
        .mockImplementation(() => undefined);

      await service.transaction(() => Promise.resolve(undefined));
      await service.transaction(() => Promise.resolve(undefined));

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'provisioning_datasource_fallback' }),
      );
    });

    it('propaga erro do callback (a transação precisa abortar)', async () => {
      const { runtime } = makeRuntime();
      const service = new ProvisioningDataSourceService(
        makeConfig(),
        runtime as unknown as DataSource,
      );

      await expect(
        service.transaction(() => {
          throw new Error('conflito');
        }),
      ).rejects.toThrow('conflito');
    });
  });
});
