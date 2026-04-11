import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Otimizações específicas para Supabase (PostgreSQL gerenciado)
 *
 * Stack: Render (web + worker) → Supabase PgBouncer pooler → PostgreSQL
 *
 * Esta migration faz ajustes que são seguros em Supabase e não requerem
 * permissão de superusuário:
 *
 * 1. pg_stat_statements — habilita rastreamento de queries lentas.
 *    No Supabase já vem habilitado por padrão, mas o CREATE EXTENSION é
 *    idempotente. Permite usar a view pg_stat_statements para identificar
 *    queries que precisam de otimização.
 *
 * 2. Estatísticas estendidas — CREATE STATISTICS para correlações entre
 *    colunas usadas juntas em WHERE (melhora estimativas do planner).
 *    Exemplo: (company_id, status) são sempre filtradas juntas — o planner
 *    pode subestimar a seletividade sem estatísticas de correlação.
 *
 * 3. Configurações de autovacuum mais agressivas para tabelas de alta escrita:
 *    audit_logs e mail_logs crescem rápido e tendem a inchar (bloat) sem
 *    autovacuum frequente. Ajustamos os thresholds a nível de tabela
 *    (não requer superusuário, apenas OWNER ou SUPERUSER na tabela).
 *
 * 4. Reset de pg_stat_user_tables (apenas log informativo — sem efeito colateral).
 *
 * NOTA: Em Supabase, ALTER TABLE ... SET (autovacuum_*) requer que o usuário
 * seja o owner da tabela (normalmente 'postgres' no Supabase). Se o usuário
 * da migration não for owner, a instrução será ignorada silenciosamente.
 */
export class SupabaseRuntimeOptimizations1709000000114 implements MigrationInterface {
  name = 'SupabaseRuntimeOptimizations1709000000114';
  transaction = false;

  private async safeQuery(
    queryRunner: QueryRunner,
    sql: string,
    label: string,
  ): Promise<void> {
    try {
      await queryRunner.query(sql);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[114] ${label}: ${msg}`);
    }
  }

  private async hasColumns(
    queryRunner: QueryRunner,
    table: string,
    columns: readonly string[],
  ): Promise<boolean> {
    if (!(await queryRunner.hasTable(table))) {
      return false;
    }

    for (const column of columns) {
      if (!(await queryRunner.hasColumn(table, column))) {
        return false;
      }
    }

    return true;
  }

  private async createStatisticsIfPossible(
    queryRunner: QueryRunner,
    options: {
      table: string;
      columns: readonly string[];
      sql: string;
      label: string;
    },
  ): Promise<boolean> {
    const { table, columns, sql, label } = options;
    if (!(await this.hasColumns(queryRunner, table, columns))) {
      console.warn(
        `[114] ${label}: skipped because ${table} is missing one of [${columns.join(
          ', ',
        )}]`,
      );
      return false;
    }

    await this.safeQuery(queryRunner, sql, label);
    return true;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // =========================================================
    // 1. pg_stat_statements — rastreamento de queries lentas
    // =========================================================
    await this.safeQuery(
      queryRunner,
      `CREATE EXTENSION IF NOT EXISTS pg_stat_statements`,
      'pg_stat_statements',
    );

    // =========================================================
    // 2. Estatísticas de correlação multi-coluna
    //    O planner do PostgreSQL assume independência entre colunas por padrão.
    //    Com CREATE STATISTICS, ele aprende que (company_id, status) são correlatas,
    //    melhorando as estimativas de cardinalidade nas queries mais quentes.
    // =========================================================

    // aprs: (company_id, status) — query mais quente do sistema
    const tablesToAnalyze = new Set<string>();

    if (
      await this.createStatisticsIfPossible(queryRunner, {
        table: 'aprs',
        columns: ['company_id', 'status'],
        sql: `CREATE STATISTICS IF NOT EXISTS "stat_aprs_company_status"
              (dependencies, ndistinct)
              ON company_id, status
              FROM aprs`,
        label: 'stat_aprs_company_status',
      })
    ) {
      tablesToAnalyze.add('aprs');
    }

    // pts: (company_id, status)
    if (
      await this.createStatisticsIfPossible(queryRunner, {
        table: 'pts',
        columns: ['company_id', 'status'],
        sql: `CREATE STATISTICS IF NOT EXISTS "stat_pts_company_status"
              (dependencies, ndistinct)
              ON company_id, status
              FROM pts`,
        label: 'stat_pts_company_status',
      })
    ) {
      tablesToAnalyze.add('pts');
    }

    // nonconformities: (company_id, status)
    if (
      await this.createStatisticsIfPossible(queryRunner, {
        table: 'nonconformities',
        columns: ['company_id', 'status'],
        sql: `CREATE STATISTICS IF NOT EXISTS "stat_nonconformities_company_status"
              (dependencies, ndistinct)
              ON company_id, status
              FROM nonconformities`,
        label: 'stat_nonconformities_company_status',
      })
    ) {
      tablesToAnalyze.add('nonconformities');
    }

    // checklists: (company_id, status)
    if (
      await this.createStatisticsIfPossible(queryRunner, {
        table: 'checklists',
        columns: ['company_id', 'status'],
        sql: `CREATE STATISTICS IF NOT EXISTS "stat_checklists_company_status"
              (dependencies, ndistinct)
              ON company_id, status
              FROM checklists`,
        label: 'stat_checklists_company_status',
      })
    ) {
      tablesToAnalyze.add('checklists');
    }

    // dds: (company_id, status)
    if (
      await this.createStatisticsIfPossible(queryRunner, {
        table: 'dds',
        columns: ['company_id', 'status'],
        sql: `CREATE STATISTICS IF NOT EXISTS "stat_dds_company_status"
              (dependencies, ndistinct)
              ON company_id, status
              FROM dds`,
        label: 'stat_dds_company_status',
      })
    ) {
      tablesToAnalyze.add('dds');
    }

    // trainings: (company_id, status, data_vencimento) — expiry queries
    if (
      await this.createStatisticsIfPossible(queryRunner, {
        table: 'trainings',
        columns: ['company_id', 'status', 'data_vencimento'],
        sql: `CREATE STATISTICS IF NOT EXISTS "stat_trainings_company_status_venc"
              (dependencies, ndistinct)
              ON company_id, status, data_vencimento
              FROM trainings`,
        label: 'stat_trainings_company_status_venc',
      })
    ) {
      tablesToAnalyze.add('trainings');
    }

    // ANALYZE para gerar as estatísticas imediatamente
    if (tablesToAnalyze.size > 0) {
      await this.safeQuery(
        queryRunner,
        `ANALYZE ${Array.from(tablesToAnalyze).join(', ')}`,
        'ANALYZE hot tables',
      );
    }

    // =========================================================
    // 3. Autovacuum mais agressivo para tabelas de alta escrita
    //    audit_logs: cresce com cada operação CRUD
    //    mail_logs:  cresce com cada e-mail enviado
    //    apr_logs:   cresce com cada mudança de status de APR
    //
    //    Padrão Supabase: autovacuum_vacuum_scale_factor = 0.2 (20% de dead tuples)
    //    Ajuste: 0.05 (5%) para tabelas de audit → vacuum mais frequente
    //    Isso reduz bloat e mantém HOT update path eficiente
    // =========================================================
    const highWriteTables = [
      'audit_logs',
      'mail_logs',
      'apr_logs',
      'forensic_trail_events',
    ];

    for (const table of highWriteTables) {
      const exists = await queryRunner.hasTable(table);
      if (!exists) continue;

      await this.safeQuery(
        queryRunner,
        `ALTER TABLE "${table}"
         SET (
           autovacuum_vacuum_scale_factor     = 0.05,
           autovacuum_analyze_scale_factor    = 0.02,
           autovacuum_vacuum_cost_delay       = 2
         )`,
        `autovacuum for ${table}`,
      );
    }

    // =========================================================
    // 4. Configuração de work_mem para queries de aggregation
    //    Ajuste LOCAL por sessão — não altera configuração global.
    //    Apenas documenta o valor recomendado; não pode ser persistido via migration.
    //    Usar env DATABASE_URL com ?options=-c work_mem=16MB para Render.
    // =========================================================
    console.log(`
[114] RECOMENDAÇÕES DE CONFIGURAÇÃO PARA SUPABASE/RENDER:

  Render (env vars do web service):
    DATABASE_URL         = postgresql://...@aws-*.pooler.supabase.com:6543/postgres
    DATABASE_DIRECT_URL  = postgresql://...@aws-*.supabase.com:5432/postgres
    DB_POOL_MAX          = 20
    DB_POOL_MIN          = 2
    DB_STATEMENT_TIMEOUT_MS = 30000

  Supabase Dashboard → SQL Editor:
    -- Verificar queries lentas:
    SELECT query, calls, total_exec_time/calls AS avg_ms,
           rows/calls AS avg_rows
    FROM pg_stat_statements
    WHERE calls > 100
    ORDER BY avg_ms DESC
    LIMIT 20;

    -- Verificar bloat de índices:
    SELECT relname, n_dead_tup, n_live_tup,
           ROUND(100*n_dead_tup/(n_live_tup+n_dead_tup+1)::numeric, 1) AS dead_pct
    FROM pg_stat_user_tables
    WHERE n_live_tup > 1000
    ORDER BY dead_pct DESC;

    -- Buffer cache hit rate (meta: > 99%):
    SELECT SUM(heap_blks_hit) / (SUM(heap_blks_hit) + SUM(heap_blks_read) + 1) * 100
    FROM pg_statio_user_tables;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverter autovacuum para defaults
    const highWriteTables = [
      'audit_logs',
      'mail_logs',
      'apr_logs',
      'forensic_trail_events',
    ];

    for (const table of highWriteTables) {
      if (!(await queryRunner.hasTable(table))) continue;
      await this.safeQuery(
        queryRunner,
        `ALTER TABLE "${table}" RESET (
           autovacuum_vacuum_scale_factor,
           autovacuum_analyze_scale_factor,
           autovacuum_vacuum_cost_delay
         )`,
        `reset autovacuum for ${table}`,
      );
    }

    // DROP STATISTICS
    const stats = [
      'stat_aprs_company_status',
      'stat_pts_company_status',
      'stat_nonconformities_company_status',
      'stat_checklists_company_status',
      'stat_dds_company_status',
      'stat_trainings_company_status_venc',
    ];

    for (const stat of stats) {
      await this.safeQuery(
        queryRunner,
        `DROP STATISTICS IF EXISTS "${stat}"`,
        `drop ${stat}`,
      );
    }
  }
}
