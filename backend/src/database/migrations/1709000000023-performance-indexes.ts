import { MigrationInterface, QueryRunner } from 'typeorm';

type InformationSchemaTableRow = {
  table_name: string;
};

function isInformationSchemaTableRow(
  value: unknown,
): value is InformationSchemaTableRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    'table_name' in value &&
    typeof (value as { table_name?: unknown }).table_name === 'string'
  );
}

/**
 * Índices de performance para escala multi-tenant.
 *
 * ESTRATÉGIA:
 *  - FASE 1: índice company_id dinâmico em TODAS as tabelas que possuem
 *    essa coluna (garante que RLS + filtros de tenant usem index scan).
 *  - FASE 2: índices compostos nos access-patterns de maior frequência
 *    (listagens paginadas, filtros por status, por site, por usuário).
 *  - FASE 3: índices especiais (login por CPF, lookup de e-mail).
 *
 * Todos os índices usam IF NOT EXISTS → idempotente e sem downtime.
 * Em produção, o banco já contém dados; portanto usamos CONCURRENTLY e
 * desabilitamos a transação implícita da migration.
 */
export class PerformanceIndexes1709000000023 implements MigrationInterface {
  name = 'PerformanceIndexes1709000000023';
  transaction = false;

  private async safe(queryRunner: QueryRunner, sql: string, label: string) {
    try {
      await queryRunner.query(sql);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[023] ${label} SKIPPED: ${msg}`);
    }
  }

  private formatIndexColumn(column: string): string {
    const match = column.match(/^([a-zA-Z0-9_]+)\s+(ASC|DESC)$/i);
    if (match) {
      return `"${match[1]}" ${match[2].toUpperCase()}`;
    }

    return `"${column}"`;
  }

  private async hasAllColumns(
    queryRunner: QueryRunner,
    table: string,
    columns: string[],
  ): Promise<boolean> {
    for (const column of columns) {
      if (!(await queryRunner.hasColumn(table, column))) {
        return false;
      }
    }

    return true;
  }

  private async createIndexIfPossible(
    queryRunner: QueryRunner,
    definition: {
      name: string;
      table: string;
      columns: string[];
    },
  ): Promise<void> {
    const tableExists = await queryRunner.hasTable(definition.table);
    if (!tableExists) {
      console.warn(
        `[023] ${definition.table} missing, skipping ${definition.name}`,
      );
      return;
    }

    const requiredColumns = definition.columns.map((column) =>
      column.replace(/\s+(ASC|DESC)$/i, ''),
    );
    const hasColumns = await this.hasAllColumns(
      queryRunner,
      definition.table,
      requiredColumns,
    );
    if (!hasColumns) {
      console.warn(
        `[023] required columns missing on ${definition.table}, skipping ${definition.name}`,
      );
      return;
    }

    const columnList = definition.columns
      .map((column) => this.formatIndexColumn(column))
      .join(', ');

    await this.safe(
      queryRunner,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "${definition.name}" ON "${definition.table}" (${columnList})`,
      definition.name,
    );
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // -----------------------------------------------------------------------
    // FASE 1 — company_id em TODAS as tabelas (dinâmico)
    // -----------------------------------------------------------------------
    const rowsResult: unknown = await queryRunner.query(`
      SELECT DISTINCT table_name
      FROM information_schema.columns
      WHERE column_name = 'company_id'
        AND table_schema = 'public'
      ORDER BY table_name
    `);
    const rows = Array.isArray(rowsResult)
      ? rowsResult.filter(isInformationSchemaTableRow)
      : [];

    for (const { table_name } of rows) {
      const exists = await queryRunner.hasTable(table_name);
      if (!exists) continue;

      await this.safe(
        queryRunner,
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_${table_name}_company_id"
         ON "${table_name}" ("company_id")`,
        `idx_${table_name}_company_id`,
      );
    }

    // -----------------------------------------------------------------------
    // FASE 2 — Compostos para access-patterns de alta frequência
    // -----------------------------------------------------------------------

    const compositeIndexes = [
      {
        name: 'idx_users_company_status',
        table: 'users',
        columns: ['company_id', 'status'],
      },
      {
        name: 'idx_users_company_site',
        table: 'users',
        columns: ['company_id', 'site_id'],
      },
      {
        name: 'idx_users_company_created',
        table: 'users',
        columns: ['company_id', 'created_at DESC'],
      },
      {
        name: 'idx_sites_company_status',
        table: 'sites',
        columns: ['company_id', 'status'],
      },
      {
        name: 'idx_aprs_company_created',
        table: 'aprs',
        columns: ['company_id', 'created_at DESC'],
      },
      {
        name: 'idx_aprs_company_status',
        table: 'aprs',
        columns: ['company_id', 'status'],
      },
      {
        name: 'idx_aprs_company_site',
        table: 'aprs',
        columns: ['company_id', 'site_id'],
      },
      {
        name: 'idx_pts_company_created',
        table: 'pts',
        columns: ['company_id', 'created_at DESC'],
      },
      {
        name: 'idx_pts_company_status',
        table: 'pts',
        columns: ['company_id', 'status'],
      },
      {
        name: 'idx_pts_company_site',
        table: 'pts',
        columns: ['company_id', 'site_id'],
      },
      {
        name: 'idx_dds_company_created',
        table: 'dds',
        columns: ['company_id', 'created_at DESC'],
      },
      {
        name: 'idx_dds_company_site',
        table: 'dds',
        columns: ['company_id', 'site_id'],
      },
      {
        name: 'idx_checklists_company_created',
        table: 'checklists',
        columns: ['company_id', 'created_at DESC'],
      },
      {
        name: 'idx_checklists_company_status',
        table: 'checklists',
        columns: ['company_id', 'status'],
      },
      {
        name: 'idx_checklists_company_site',
        table: 'checklists',
        columns: ['company_id', 'site_id'],
      },
      {
        name: 'idx_epi_assignments_company_user',
        table: 'epi_assignments',
        columns: ['company_id', 'user_id'],
      },
      {
        name: 'idx_epi_assignments_company_created',
        table: 'epi_assignments',
        columns: ['company_id', 'created_at DESC'],
      },
      {
        name: 'idx_epi_assignments_company_status',
        table: 'epi_assignments',
        columns: ['company_id', 'status'],
      },
      {
        name: 'idx_cats_company_created',
        table: 'cats',
        columns: ['company_id', 'created_at DESC'],
      },
      {
        name: 'idx_cats_company_status',
        table: 'cats',
        columns: ['company_id', 'status'],
      },
      {
        name: 'idx_cats_company_site',
        table: 'cats',
        columns: ['company_id', 'site_id'],
      },
      {
        name: 'idx_trainings_company_user',
        table: 'trainings',
        columns: ['company_id', 'user_id'],
      },
      {
        name: 'idx_trainings_company_created',
        table: 'trainings',
        columns: ['company_id', 'created_at DESC'],
      },
      {
        name: 'idx_signatures_company_user',
        table: 'signatures',
        columns: ['company_id', 'user_id'],
      },
      {
        name: 'idx_signatures_company_created',
        table: 'signatures',
        columns: ['company_id', 'created_at DESC'],
      },
      {
        name: 'idx_audits_company_created',
        table: 'audits',
        columns: ['company_id', 'created_at DESC'],
      },
      {
        name: 'idx_audits_company_site',
        table: 'audits',
        columns: ['company_id', 'site_id'],
      },
      {
        name: 'idx_inspections_company_created',
        table: 'inspections',
        columns: ['company_id', 'created_at DESC'],
      },
      {
        name: 'idx_inspections_company_site',
        table: 'inspections',
        columns: ['company_id', 'site_id'],
      },
      {
        name: 'idx_nonconformities_company_created',
        table: 'nonconformities',
        columns: ['company_id', 'created_at DESC'],
      },
      {
        name: 'idx_nonconformities_company_status',
        table: 'nonconformities',
        columns: ['company_id', 'status'],
      },
      {
        name: 'idx_nonconformities_company_site',
        table: 'nonconformities',
        columns: ['company_id', 'site_id'],
      },
      {
        name: 'idx_corrective_actions_company_status',
        table: 'corrective_actions',
        columns: ['company_id', 'status'],
      },
      {
        name: 'idx_corrective_actions_company_created',
        table: 'corrective_actions',
        columns: ['company_id', 'created_at DESC'],
      },
      {
        name: 'idx_contracts_company_status',
        table: 'contracts',
        columns: ['company_id', 'status'],
      },
      {
        name: 'idx_reports_company_created',
        table: 'reports',
        columns: ['company_id', 'created_at DESC'],
      },
      {
        name: 'idx_mail_logs_company_created',
        table: 'mail_logs',
        columns: ['company_id', 'created_at DESC'],
      },
      {
        name: 'idx_mail_logs_company_status',
        table: 'mail_logs',
        columns: ['company_id', 'status'],
      },
    ];

    for (const definition of compositeIndexes) {
      await this.createIndexIfPossible(queryRunner, definition);
    }

    // -----------------------------------------------------------------------
    // FASE 3 — Índices especiais
    // -----------------------------------------------------------------------
    const specialIndexes = [
      { name: 'idx_users_cpf', table: 'users', columns: ['cpf'] },
      { name: 'idx_mail_logs_to', table: 'mail_logs', columns: ['to'] },
      {
        name: 'idx_epi_assignments_epi_id',
        table: 'epi_assignments',
        columns: ['epi_id'],
      },
    ];

    for (const definition of specialIndexes) {
      await this.createIndexIfPossible(queryRunner, definition);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Fase 3
    await this.safe(
      queryRunner,
      `DROP INDEX CONCURRENTLY IF EXISTS "idx_epi_assignments_epi_id"`,
      'drop idx_epi_assignments_epi_id',
    );
    await this.safe(
      queryRunner,
      `DROP INDEX CONCURRENTLY IF EXISTS "idx_mail_logs_to"`,
      'drop idx_mail_logs_to',
    );
    await this.safe(
      queryRunner,
      `DROP INDEX CONCURRENTLY IF EXISTS "idx_users_cpf"`,
      'drop idx_users_cpf',
    );

    // Fase 2 — compostos
    const composites = [
      'idx_mail_logs_company_status',
      'idx_mail_logs_company_created',
      'idx_reports_company_created',
      'idx_contracts_company_status',
      'idx_corrective_actions_company_created',
      'idx_corrective_actions_company_status',
      'idx_nonconformities_company_site',
      'idx_nonconformities_company_status',
      'idx_nonconformities_company_created',
      'idx_inspections_company_site',
      'idx_inspections_company_created',
      'idx_audits_company_site',
      'idx_audits_company_created',
      'idx_signatures_company_created',
      'idx_signatures_company_user',
      'idx_trainings_company_created',
      'idx_trainings_company_user',
      'idx_cats_company_site',
      'idx_cats_company_status',
      'idx_cats_company_created',
      'idx_epi_assignments_company_status',
      'idx_epi_assignments_company_created',
      'idx_epi_assignments_company_user',
      'idx_checklists_company_site',
      'idx_checklists_company_status',
      'idx_checklists_company_created',
      'idx_dds_company_site',
      'idx_dds_company_created',
      'idx_pts_company_site',
      'idx_pts_company_status',
      'idx_pts_company_created',
      'idx_aprs_company_site',
      'idx_aprs_company_status',
      'idx_aprs_company_created',
      'idx_sites_company_status',
      'idx_users_company_created',
      'idx_users_company_site',
      'idx_users_company_status',
    ];

    for (const idx of composites) {
      await this.safe(
        queryRunner,
        `DROP INDEX CONCURRENTLY IF EXISTS "${idx}"`,
        `drop ${idx}`,
      );
    }

    // Fase 1 — company_id dinâmicos
    const rowsResult: unknown = await queryRunner.query(`
      SELECT DISTINCT table_name
      FROM information_schema.columns
      WHERE column_name = 'company_id' AND table_schema = 'public'
    `);
    const rows = Array.isArray(rowsResult)
      ? rowsResult.filter(isInformationSchemaTableRow)
      : [];
    for (const { table_name } of rows) {
      await this.safe(
        queryRunner,
        `DROP INDEX CONCURRENTLY IF EXISTS "idx_${table_name}_company_id"`,
        `drop idx_${table_name}_company_id`,
      );
    }
  }
}
