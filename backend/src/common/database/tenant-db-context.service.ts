import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantService } from '../tenant/tenant.service';
import { DbTimingsService } from './db-timings.service';

/**
 * Injeção automática de contexto RLS no pool de conexões PostgreSQL.
 *
 * PROBLEMA RESOLVIDO:
 *   TypeORM usa um pool de conexões (pg.Pool). Quando um repositório executa
 *   um `find()`, ele pega UMA conexão do pool. A sessão dessa conexão específica
 *   precisa ter `app.current_company_id` definido ANTES de qualquer query para
 *   que o PostgreSQL RLS funcione corretamente.
 *
 *   As abordagens anteriores (SET no interceptor ou SET LOCAL em um queryRunner
 *   separado) não funcionam porque cada operação pode pegar uma conexão
 *   diferente do pool.
 *
 * SOLUÇÃO:
 *   Patcheamos o método `pool.connect()` do pg driver. Toda vez que o TypeORM
 *   pega uma conexão do pool (para qualquer operação: repositório, queryRunner,
 *   etc.), nossa função é chamada PRIMEIRO. Ela lê o `TenantContext` da
 *   AsyncLocalStorage (propagada por Node.js para toda a cadeia async) e executa
 *   um único `set_config(...)` que define as variáveis de sessão do PostgreSQL
 *   para essa conexão específica.
 *
 * RESULTADO:
 *   - Todos os repositórios injetados usam RLS automaticamente.
 *   - Zero mudanças necessárias em qualquer service.
 *   - Overhead mínimo: 1 round-trip extra por conexão borrowed do pool.
 *   - Seguro com connection pooling: a cada acquire, o contexto é reescrito.
 *
 * SUPER ADMIN:
 *   Quando `isSuperAdmin = true` no contexto, a policy RLS:
 *   `USING (company_id = current_company() OR is_super_admin() = true)`
 *   permite acesso cross-tenant.
 *
 * LOGIN (rota pública):
 *   Não há contexto → `app.current_company_id = ''` e `app.is_super_admin = false`.
 *   A AuthService usa `SET LOCAL app.is_super_admin = true` dentro de uma
 *   transação explícita para encontrar o usuário sem restrição de tenant.
 */
@Injectable()
export class TenantDbContextService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TenantDbContextService.name);
  private patched = false;
  private readonly patchedQuerySymbol = Symbol.for('db_timings_patched_query');

  constructor(
    private readonly dataSource: DataSource,
    private readonly tenantService: TenantService,
    private readonly dbTimings: DbTimingsService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.dataSource.isInitialized) {
      this.patchPool();
      return;
    }
    // DataSource ainda não inicializado (boot lazy). Aguarda em background.
    const interval = setInterval(() => {
      if (this.dataSource.isInitialized) {
        clearInterval(interval);
        this.patchPool();
      }
    }, 500);
  }

  private patchPool(): void {
    if (this.patched) return;

    // TypeORM's PostgresDriver expõe o pg.Pool como `.master`
    const driver = this.dataSource.driver as unknown as {
      master?: {
        connect: () => Promise<PgClient>;
      };
    };

    const pool = driver.master;

    if (!pool || typeof pool.connect !== 'function') {
      this.logger.warn(
        'TenantDbContextService: pg Pool não encontrado no driver TypeORM. ' +
          'Certifique-se de usar o driver postgres. ' +
          'RLS context injection será desabilitado.',
      );
      return;
    }

    const tenantService = this.tenantService;
    const logger = this.logger;
    const originalConnect = pool.connect.bind(pool);
    const self = this;

    /**
     * Injeta o contexto RLS em uma conexão adquirida do pool (lógica comum
     * entre o path de callback e o path de Promise).
     */
    const injectRlsContext = async (borrowStart: bigint): Promise<PgClient> => {
      const client = await originalConnect();
      const borrowMs =
        Number(process.hrtime.bigint() - borrowStart) / 1_000_000;
      self.dbTimings.recordBorrowWait(borrowMs);
      const ctx = tenantService.getContext();

      try {
        /**
         * Usa set_config com parâmetros para evitar SQL injection.
         * is_local = false → nível de sessão (persiste pela conexão até que seja
         * sobrescrito no próximo pool.connect() para esta conexão).
         *
         * Combina os dois SET em uma única query para minimizar round-trips.
         *
         * empty string → current_company() lança exceção → capturada → retorna NULL
         * → RLS bloqueia. Isso é o comportamento correto para rotas sem tenant.
         */
        const setStart = process.hrtime.bigint();
        await client.query(
          `SELECT
             set_config('app.current_company',    $1, false),
             set_config('app.current_company_id', $1, false),
             set_config('app.is_super_admin',     $2, false)`,
          [ctx?.companyId ?? '', String(ctx?.isSuperAdmin ?? false)],
        );
        const setMs = Number(process.hrtime.bigint() - setStart) / 1_000_000;
        self.dbTimings.recordRlsContextSet(setMs);
      } catch (err) {
        // Fail-closed: se não conseguir setar o contexto, zera o tenant para
        // evitar vazamento cross-tenant em conexões reaproveitadas do pool.
        logger.error(
          'TenantDbContextService: falha ao injetar contexto RLS na conexão (fail-closed)',
          err,
        );
        try {
          await client.query(
            `SELECT
               set_config('app.current_company',    $1, false),
               set_config('app.current_company_id', $1, false),
               set_config('app.is_super_admin',     $2, false)`,
            ['', 'false'],
          );
        } catch (resetErr) {
          try {
            client.release(resetErr as Error);
          } catch {
            // ignore
          }
          throw resetErr;
        }
      }

      self.patchClientQuery(client);
      return client;
    };

    /**
     * IMPORTANTE: TypeORM (v0.3.x) usa a forma CALLBACK de pool.connect():
     *   pool.connect((err, client, release) => { ... })
     *
     * Precisamos suportar AMBAS as formas para não quebrar o TypeORM:
     *  - Callback: pool.connect(fn) → chama fn(null, client, release)
     *  - Promise:  pool.connect()   → retorna Promise<PgClient>
     */
    (pool as unknown as Record<string, unknown>).connect = function (
      callback?: (
        err: Error | null,
        client?: PgClient,
        release?: (err?: Error) => void,
      ) => void,
    ): Promise<PgClient> | void {
      const borrowStart = process.hrtime.bigint();

      if (typeof callback === 'function') {
        // Forma callback — usada pelo TypeORM para adquirir conexões de pool
        injectRlsContext(borrowStart)
          .then((client) => {
            callback(null, client, (err?: Error) => client.release(err));
          })
          .catch((err: Error) => {
            callback(err);
          });
        return;
      }

      // Forma Promise — usada quando pool.connect() é chamado sem callback
      return injectRlsContext(borrowStart);
    };

    this.patched = true;
    this.logger.log(
      '✅ pg Pool patcheado — app.current_company_id e app.is_super_admin ' +
        'serão injetados automaticamente em cada conexão adquirida do pool.',
    );
  }

  private patchClientQuery(client: PgClient): void {
    if (!this.dbTimings.isEnabled()) return;

    const anyClient = client as unknown as Record<string | symbol, unknown>;
    if (anyClient[this.patchedQuerySymbol]) return;
    anyClient[this.patchedQuerySymbol] = true;

    const originalQuery = client.query.bind(client);
    client.query = (async (sql: string, params?: unknown[]) => {
      const start = process.hrtime.bigint();
      try {
        return await originalQuery(sql, params);
      } finally {
        const ms = Number(process.hrtime.bigint() - start) / 1_000_000;
        this.dbTimings.recordQuery(ms);
      }
    }) as PgClient['query'];
  }
}

/** Tipo mínimo do pg.PoolClient necessário para o patch. */
interface PgClient {
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
  release: (err?: boolean | Error) => void;
}
