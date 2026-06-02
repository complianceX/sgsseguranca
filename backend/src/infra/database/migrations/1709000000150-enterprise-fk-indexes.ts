import { createHash } from 'node:crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';

type MissingFkIndexRow = {
  schema_name: string;
  table_name: string;
  columns_csv: string;
};

type ManagedIndexRow = {
  schema_name: string;
  index_name: string;
};

const MANAGED_INDEX_COMMENT = 'sgs:auto_fk_index:1709000000150';

function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function buildFkIndexName(tableName: string, columnsCsv: string): string {
  const base = `IDX_fk_${tableName}_${columnsCsv.replace(/,/g, '_')}`;
  if (base.length <= 55) {
    return base;
  }

  const hash = createHash('sha1')
    .update(`${tableName}:${columnsCsv}`)
    .digest('hex')
    .slice(0, 8);
  return `${base.slice(0, 46)}_${hash}`;
}

function quoteColumnList(columnsCsv: string): string {
  return columnsCsv
    .split(',')
    .map((column) => quoteIdent(column.trim()))
    .join(', ');
}

export class EnterpriseFkIndexes1709000000150 implements MigrationInterface {
  name = 'EnterpriseFkIndexes1709000000150';

  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.createMissingForeignKeyIndexes(queryRunner);
    await this.dropRedundantIndexes(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.dropManagedForeignKeyIndexes(queryRunner);
  }

  private async createMissingForeignKeyIndexes(
    queryRunner: QueryRunner,
  ): Promise<void> {
    const rows = (await queryRunner.query(`
      WITH fk AS (
        SELECT c.conrelid,
               n.nspname AS schema_name,
               rel.relname AS table_name,
               c.conkey,
               ARRAY(
                 SELECT a.attname
                 FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
                 JOIN pg_attribute a
                   ON a.attrelid = c.conrelid
                  AND a.attnum = k.attnum
                 ORDER BY k.ord
               ) AS columns
        FROM pg_constraint c
        JOIN pg_class rel ON rel.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = rel.relnamespace
        WHERE c.contype = 'f'
          AND n.nspname = 'public'
      )
      SELECT schema_name,
             table_name,
             array_to_string(columns, ',') AS columns_csv
      FROM fk
      WHERE NOT EXISTS (
        SELECT 1
        FROM pg_index i
        WHERE i.indrelid = fk.conrelid
          AND i.indisvalid
          AND (i.indkey::smallint[])[0:array_length(fk.conkey, 1) - 1] = fk.conkey
      )
      ORDER BY schema_name, table_name, columns_csv
    `)) as MissingFkIndexRow[];

    const seen = new Set<string>();
    for (const row of rows) {
      const dedupeKey = `${row.schema_name}.${row.table_name}.${row.columns_csv}`;
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);

      const indexName = buildFkIndexName(row.table_name, row.columns_csv);
      await queryRunner.query(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS ${quoteIdent(indexName)}
        ON ${quoteIdent(row.schema_name)}.${quoteIdent(row.table_name)}
        (${quoteColumnList(row.columns_csv)})
      `);
      await queryRunner.query(`
        COMMENT ON INDEX ${quoteIdent(row.schema_name)}.${quoteIdent(indexName)}
        IS '${MANAGED_INDEX_COMMENT}'
      `);
    }
  }

  private async dropRedundantIndexes(queryRunner: QueryRunner): Promise<void> {
    const redundantIndexes = [
      '"IDX_apr_risk_evidences_item_id"',
      '"idx_aprs_company_updated_active"',
      '"idx_contracts_company_id"',
    ];

    for (const indexName of redundantIndexes) {
      await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS ${indexName}`);
    }
  }

  private async dropManagedForeignKeyIndexes(
    queryRunner: QueryRunner,
  ): Promise<void> {
    const rows = (await queryRunner.query(
      `
        SELECT n.nspname AS schema_name,
               c.relname AS index_name
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'i'
          AND obj_description(c.oid, 'pg_class') = $1
        ORDER BY n.nspname, c.relname
      `,
      [MANAGED_INDEX_COMMENT],
    )) as ManagedIndexRow[];

    for (const row of rows) {
      await queryRunner.query(
        `DROP INDEX CONCURRENTLY IF EXISTS ${quoteIdent(row.schema_name)}.${quoteIdent(row.index_name)}`,
      );
    }
  }
}
