import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, DataSourceOptions, EntityManager } from 'typeorm';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';

/**
 * Monta as opções da conexão dedicada a partir das da conexão de runtime.
 *
 * Exportada para poder ser testada isoladamente: os erros possíveis aqui são
 * silenciosos e graves (herdar a réplica manda os SELECTs de volta para a
 * credencial sem bypass; esquecer de limpar host/port faz o `url` ser ignorado),
 * e nenhum deles apareceria como exceção — só como "não encontrou o convite".
 */
export function buildProvisioningDataSourceOptions(input: {
  base: PostgresConnectionOptions;
  adminUrl: string;
  entities: unknown[];
  poolMax: number;
}): DataSourceOptions {
  const { base, adminUrl, entities, poolMax } = input;
  return {
    ...base,
    name: 'tenant-provisioning',
    // A URL dedicada substitui QUALQUER forma de endereçamento herdada — tanto
    // `url` quanto o conjunto host/port/username/password/database. Deixar
    // qualquer um deles para trás faria a conexão autenticar com a credencial
    // errada, que é justamente o bug que esta classe existe para corrigir.
    url: adminUrl,
    host: undefined,
    port: undefined,
    username: undefined,
    password: undefined,
    database: undefined,
    // A réplica de leitura aponta para a credencial de runtime. Herdá-la aqui
    // mandaria os SELECTs de volta para a conexão sem bypass.
    replication: undefined,
    entities,
    // Esta conexão jamais roda DDL. Migrations continuam sendo responsabilidade
    // exclusiva de DATABASE_MIGRATION_URL.
    migrations: [],
    migrationsRun: false,
    synchronize: false,
    extra: {
      ...((base.extra ?? {}) as Record<string, unknown>),
      // Pool mínimo: provisionamento é raro e não deve segurar conexões do Neon
      // à toa.
      max: poolMax,
      min: 0,
      application_name: 'api_provisioning',
    },
  } as DataSourceOptions;
}

/**
 * Conexão TypeORM dedicada para **provisionamento de tenant** — o punhado de
 * operações que criam um tenant do zero e portanto não têm tenant nenhum para
 * usar como contexto.
 *
 * ## Por que isto existe
 *
 * A migration 361 revogou a membership de `sgs_app` em `sgs_rls_bypass`, e
 * `is_super_admin()` começa checando exatamente essa membership:
 *
 * ```sql
 * IF NOT pg_has_role(current_user, 'sgs_rls_bypass', 'MEMBER') THEN RETURN false;
 * ```
 *
 * Ou seja: na conexão de runtime, `SET LOCAL app.is_super_admin = 'true'` virou
 * um no-op. Toda política que dependa de `is_super_admin()` passou a negar. Para
 * a maioria do sistema isso é irrelevante (há sempre um `company_id` no
 * contexto), mas o provisionamento é o caso em que **a empresa ainda não
 * existe** — não há `current_company()` a comparar, e todas as políticas caem no
 * ramo `is_super_admin()`, que agora é falso. O fluxo morre na primeira query.
 *
 * A saída é a mesma que `PrivilegedDbService` usa: autenticar como `sgs_admin`
 * (membro de `sgs_rls_bypass`) via `DATABASE_ADMIN_URL`. A diferença é que
 * `PrivilegedDbService` entrega um client `pg` cru, e o provisionamento precisa
 * de entidades TypeORM — transformers de criptografia de campo, defaults de
 * `BaseAuditEntity`, cascatas. Reescrever isso em SQL literal duplicaria o
 * conhecimento de colunas em dois lugares. Então aqui clonamos a configuração da
 * conexão de runtime e trocamos **apenas a credencial**.
 *
 * ## Degradação
 *
 * Sem `DATABASE_ADMIN_URL` (dev local, testes), cai na conexão de runtime — que
 * é exatamente o comportamento anterior. Em desenvolvimento a role costuma ter
 * bypass e tudo funciona; em produção, sem a env, o provisionamento continua
 * quebrado. Por isso o fallback **avisa alto** na primeira vez: um
 * provisionamento silenciosamente inoperante foi o que produziu este bug.
 */
@Injectable()
export class ProvisioningDataSourceService implements OnModuleDestroy {
  private readonly logger = new Logger(ProvisioningDataSourceService.name);
  private dedicated: DataSource | null = null;
  private initializing: Promise<DataSource> | null = null;
  private fallbackWarned = false;

  constructor(
    private readonly config: ConfigService,
    @InjectDataSource() private readonly runtimeDataSource: DataSource,
  ) {}

  private get adminUrl(): string {
    return (this.config.get<string>('DATABASE_ADMIN_URL') ?? '').trim();
  }

  /**
   * True quando existe uma conexão dedicada utilizável — `DATABASE_ADMIN_URL`
   * setada **e** runtime em PostgreSQL. Em SQLite (dev) não há RLS e não faz
   * sentido clonar a conexão.
   */
  isDedicated(): boolean {
    return (
      this.adminUrl.length > 0 &&
      this.runtimeDataSource.options.type === 'postgres'
    );
  }

  /**
   * Executa `fn` numa transação com `app.is_super_admin = 'true'` setado.
   *
   * Na conexão dedicada a flag tem efeito (o papel é membro de
   * `sgs_rls_bypass`); na de runtime é inócua, e o callback só funciona se o
   * papel local tiver bypass — o caso de desenvolvimento.
   */
  async transaction<T>(fn: (manager: EntityManager) => Promise<T>): Promise<T> {
    const dataSource = this.isDedicated()
      ? await this.getDedicated()
      : this.warnAndUseRuntime();

    return dataSource.transaction(async (manager) => {
      await manager.query("SET LOCAL app.is_super_admin = 'true'");
      return fn(manager);
    });
  }

  private warnAndUseRuntime(): DataSource {
    if (!this.fallbackWarned) {
      this.fallbackWarned = true;
      const isPostgres = this.runtimeDataSource.options.type === 'postgres';
      this.logger.warn({
        event: 'provisioning_datasource_fallback',
        message: isPostgres
          ? 'DATABASE_ADMIN_URL ausente: provisionamento de tenant vai usar a conexão de runtime. ' +
            'Se o papel de runtime não for membro de sgs_rls_bypass, TODA criação de tenant falhará por RLS.'
          : 'Runtime não é PostgreSQL: provisionamento usando a conexão de runtime (sem RLS).',
      });
    }
    return this.runtimeDataSource;
  }

  private async getDedicated(): Promise<DataSource> {
    if (this.dedicated?.isInitialized) return this.dedicated;
    // Duas requisições simultâneas de onboarding não podem inicializar dois pools.
    this.initializing ??= this.initializeDedicated().finally(() => {
      this.initializing = null;
    });
    return this.initializing;
  }

  private async initializeDedicated(): Promise<DataSource> {
    const options = buildProvisioningDataSourceOptions({
      base: this.runtimeDataSource.options as PostgresConnectionOptions,
      adminUrl: this.adminUrl,
      // `entityMetadatas` é a lista já resolvida pelo autoLoadEntities. Ler dela
      // (e não de `options.entities`) garante que o clone enxergue as mesmas
      // entidades que a aplicação registrou.
      entities: this.runtimeDataSource.entityMetadatas.map(
        (metadata) => metadata.target,
      ),
      poolMax: Number(this.config.get('DATABASE_ADMIN_POOL_MAX') ?? 3),
    });

    const dataSource = new DataSource(options);
    await dataSource.initialize();
    this.dedicated = dataSource;
    this.logger.log({
      event: 'provisioning_datasource_initialized',
      entities: this.runtimeDataSource.entityMetadatas.length,
    });
    return dataSource;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.dedicated?.isInitialized) {
      await this.dedicated.destroy().catch(() => undefined);
    }
    this.dedicated = null;
  }
}
