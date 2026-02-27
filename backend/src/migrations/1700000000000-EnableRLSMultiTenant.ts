import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnableRLSMultiTenant1700000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION current_company()
      RETURNS uuid AS $$
      BEGIN
        RETURN current_setting('app.current_company_id')::uuid;
      EXCEPTION
        WHEN others THEN
          RETURN NULL;
      END;
      $$ LANGUAGE plpgsql STABLE;
    `);

    const tables: Array<{ table_name: string }> = await queryRunner.query(`
      SELECT table_name
      FROM information_schema.columns
      WHERE column_name = 'company_id'
        AND table_schema = 'public';
    `);

    for (const table of tables) {
      const tableName = table.table_name;

      await queryRunner.query(
        `ALTER TABLE "${tableName}" ENABLE ROW LEVEL SECURITY`,
      );

      await queryRunner.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename = '${tableName}'
              AND policyname = '${tableName}_tenant_policy'
          ) THEN
            EXECUTE '
              CREATE POLICY "${tableName}_tenant_policy"
              ON "${tableName}"
              USING (current_company() IS NOT NULL AND company_id = current_company())
            ';
          END IF;
        END $$;
      `);

      await queryRunner.query(
        `ALTER TABLE "${tableName}" FORCE ROW LEVEL SECURITY`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables: Array<{ table_name: string }> = await queryRunner.query(`
      SELECT table_name
      FROM information_schema.columns
      WHERE column_name = 'company_id'
        AND table_schema = 'public';
    `);

    for (const table of tables) {
      const tableName = table.table_name;

      await queryRunner.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1
            FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename = '${tableName}'
              AND policyname = '${tableName}_tenant_policy'
          ) THEN
            EXECUTE 'DROP POLICY "${tableName}_tenant_policy" ON "${tableName}"';
          END IF;
        END $$;
      `);

      await queryRunner.query(
        `ALTER TABLE "${tableName}" DISABLE ROW LEVEL SECURITY`,
      );
    }

    await queryRunner.query(`DROP FUNCTION IF EXISTS current_company()`);
  }
}
