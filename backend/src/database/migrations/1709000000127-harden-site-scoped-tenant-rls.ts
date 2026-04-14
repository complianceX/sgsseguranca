import { MigrationInterface, QueryRunner } from 'typeorm';

type InformationSchemaColumnRow = {
  table_name: string;
};

const isInformationSchemaColumnRow = (
  value: unknown,
): value is InformationSchemaColumnRow =>
  typeof value === 'object' &&
  value !== null &&
  'table_name' in value &&
  typeof value.table_name === 'string';

export class HardenSiteScopedTenantRls1709000000127
  implements MigrationInterface
{
  name = 'HardenSiteScopedTenantRls1709000000127';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION current_site_scope()
      RETURNS text AS $$
      DECLARE
        scope_value text;
      BEGIN
        scope_value := current_setting('app.current_site_scope', true);
        IF scope_value IS NULL OR scope_value = '' THEN
          RETURN 'all';
        END IF;
        RETURN lower(scope_value);
      EXCEPTION
        WHEN others THEN
          RETURN 'all';
      END;
      $$ LANGUAGE plpgsql STABLE;
    `);

    const rowsResult: unknown = await queryRunner.query(`
      SELECT DISTINCT table_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name IN ('company_id', 'site_id')
      GROUP BY table_name
      HAVING COUNT(DISTINCT column_name) = 2
      ORDER BY table_name
    `);

    const rows = Array.isArray(rowsResult)
      ? rowsResult.filter(isInformationSchemaColumnRow)
      : [];

    for (const { table_name } of rows) {
      if (table_name === 'users') {
        continue;
      }

      const exists = await queryRunner.hasTable(table_name);
      if (!exists) {
        continue;
      }

      await queryRunner.query(
        `ALTER TABLE "${table_name}" ENABLE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table_name}" FORCE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(
        `DROP POLICY IF EXISTS "site_scope_isolation_policy" ON "${table_name}"`,
      );
      await queryRunner.query(`
        CREATE POLICY "site_scope_isolation_policy"
        ON "${table_name}"
        AS RESTRICTIVE
        FOR ALL
        USING (
          is_super_admin() = true
          OR (
            company_id = current_company()
            AND (
              current_site_scope() = 'all'
              OR site_id = current_site_id()
            )
          )
        )
        WITH CHECK (
          is_super_admin() = true
          OR (
            company_id = current_company()
            AND (
              current_site_scope() = 'all'
              OR site_id = current_site_id()
            )
          )
        )
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rowsResult: unknown = await queryRunner.query(`
      SELECT DISTINCT table_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name IN ('company_id', 'site_id')
      GROUP BY table_name
      HAVING COUNT(DISTINCT column_name) = 2
      ORDER BY table_name
    `);

    const rows = Array.isArray(rowsResult)
      ? rowsResult.filter(isInformationSchemaColumnRow)
      : [];

    for (const { table_name } of rows) {
      if (table_name === 'users') {
        continue;
      }

      const exists = await queryRunner.hasTable(table_name);
      if (!exists) {
        continue;
      }

      await queryRunner.query(
        `DROP POLICY IF EXISTS "site_scope_isolation_policy" ON "${table_name}"`,
      );
    }
  }
}
