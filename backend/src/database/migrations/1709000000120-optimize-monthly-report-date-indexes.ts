import { MigrationInterface, QueryRunner } from 'typeorm';

type MonthlyDateIndexDefinition = {
  table: string;
  columns: readonly string[];
  indexName: string;
  where?: string;
};

export class OptimizeMonthlyReportDateIndexes1709000000120 implements MigrationInterface {
  name = 'OptimizeMonthlyReportDateIndexes1709000000120';
  transaction = false;
  private readonly legacyChecklistIndexName = 'idx_checklists_company_date';

  private readonly indexes: readonly MonthlyDateIndexDefinition[] = [
    {
      table: 'aprs',
      columns: ['company_id', 'data_inicio'],
      indexName: 'idx_aprs_company_data_inicio_monthly',
      where: '"deleted_at" IS NULL',
    },
    {
      table: 'pts',
      columns: ['company_id', 'data_hora_inicio'],
      indexName: 'idx_pts_company_data_hora_inicio_monthly',
      where: '"deleted_at" IS NULL',
    },
    {
      table: 'dds',
      columns: ['company_id', 'data'],
      indexName: 'idx_dds_company_data_monthly',
      where: '"deleted_at" IS NULL',
    },
    {
      table: 'checklists',
      columns: ['company_id', 'data'],
      indexName: 'idx_checklists_company_data_monthly',
      where: '"deleted_at" IS NULL',
    },
    {
      table: 'trainings',
      columns: ['company_id', 'data_conclusao'],
      indexName: 'idx_trainings_company_data_conclusao_monthly',
      where: '"deleted_at" IS NULL',
    },
    {
      table: 'epis',
      columns: ['company_id', 'validade_ca'],
      indexName: 'idx_epis_company_validade_ca_monthly',
      where: '"deleted_at" IS NULL AND "validade_ca" IS NOT NULL',
    },
  ];

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

  private formatColumns(columns: readonly string[]): string {
    return columns.map((column) => `"${column}"`).join(', ');
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const definition of this.indexes) {
      const requiredColumns = definition.where
        ? Array.from(
            new Set([
              ...definition.columns,
              ...Array.from(definition.where.matchAll(/"([a-z_]+)"/g)).map(
                ([, column]) => column,
              ),
            ]),
          )
        : definition.columns;

      if (
        !(await this.hasColumns(queryRunner, definition.table, requiredColumns))
      ) {
        continue;
      }

      const whereClause = definition.where ? ` WHERE ${definition.where}` : '';
      await queryRunner.query(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "${definition.indexName}"
        ON "${definition.table}" (${this.formatColumns(definition.columns)})${whereClause}
      `);
    }

    if (
      await this.hasColumns(queryRunner, 'checklists', ['company_id', 'data'])
    ) {
      await queryRunner.query(`
        DROP INDEX CONCURRENTLY IF EXISTS "${this.legacyChecklistIndexName}"
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const definition of [...this.indexes].reverse()) {
      await queryRunner.query(`
        DROP INDEX CONCURRENTLY IF EXISTS "${definition.indexName}"
      `);
    }

    if (
      await this.hasColumns(queryRunner, 'checklists', ['company_id', 'data'])
    ) {
      await queryRunner.query(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "${this.legacyChecklistIndexName}"
        ON "checklists" ("company_id", "data" DESC)
      `);
    }
  }
}
