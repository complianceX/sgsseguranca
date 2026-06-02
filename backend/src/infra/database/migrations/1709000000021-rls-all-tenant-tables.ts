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
 * Unified RLS migration — replaces 020-prepare-rls-policies and
 * 021-update-rls-policies-super-admin.
 *
 * Key differences from previous approach:
 *  - No ALTER DATABASE (requires SUPERUSER on Railway/DBaaS)
 *  - Dynamic discovery of tables with company_id (not hardcoded list)
 *  - app.current_company_id is set per-connection by TenantInterceptor,
 *    not as a database-level default
 *  - Single policy with super-admin bypass built in
 */
export class RlsAllTenantTables1709000000021 implements MigrationInterface {
  name = 'RlsAllTenantTables1709000000021';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // -----------------------------------------------------------------
    // 1. Helper functions (idempotent via CREATE OR REPLACE)
    // -----------------------------------------------------------------
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION current_company()
      RETURNS uuid AS $$
      BEGIN
        RETURN current_setting('app.current_company_id', true)::uuid;
      EXCEPTION
        WHEN others THEN
          RETURN NULL;
      END;
      $$ LANGUAGE plpgsql STABLE;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION is_super_admin()
      RETURNS boolean AS $$
      BEGIN
        RETURN coalesce(
          current_setting('app.is_super_admin', true)::boolean,
          false
        );
      EXCEPTION
        WHEN others THEN
          RETURN false;
      END;
      $$ LANGUAGE plpgsql STABLE;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION current_user_role()
      RETURNS text AS $$
      BEGIN
        RETURN coalesce(
          current_setting('app.user_role', true)::text,
          'USER'
        );
      EXCEPTION
        WHEN others THEN
          RETURN 'USER';
      END;
      $$ LANGUAGE plpgsql STABLE;
    `);

    // -----------------------------------------------------------------
    // 2. Discover all public tables that have a company_id column
    // -----------------------------------------------------------------
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

    // -----------------------------------------------------------------
    // 3. Enable RLS + create unified tenant-isolation policy
    // -----------------------------------------------------------------
    for (const { table_name } of rows) {
      const exists = await queryRunner.hasTable(table_name);
      if (!exists) continue;

      // Enable RLS
      await queryRunner.query(
        `ALTER TABLE "${table_name}" ENABLE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table_name}" FORCE ROW LEVEL SECURITY`,
      );

      // Remove legacy policy names that may exist from previous migrations
      await queryRunner.query(
        `DROP POLICY IF EXISTS "tenant_isolation_policy" ON "${table_name}"`,
      );
      await queryRunner.query(
        `DROP POLICY IF EXISTS "deny_without_tenant" ON "${table_name}"`,
      );
      // EnableRLSMultiTenant used "{tableName}_tenant_policy" naming
      await queryRunner.query(
        `DROP POLICY IF EXISTS "${table_name}_tenant_policy" ON "${table_name}"`,
      );

      // Create unified policy:
      //   - Normal users: company_id must match current tenant context
      //   - Super admins: bypass (needed for admin operations)
      await queryRunner.query(`
        CREATE POLICY "tenant_isolation_policy"
        ON "${table_name}"
        USING (
          company_id = current_company()
          OR is_super_admin() = true
        )
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
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

      await queryRunner.query(
        `DROP POLICY IF EXISTS "tenant_isolation_policy" ON "${table_name}"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table_name}" NO FORCE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table_name}" DISABLE ROW LEVEL SECURITY`,
      );
    }

    await queryRunner.query(`DROP FUNCTION IF EXISTS current_user_role()`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS is_super_admin()`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS current_company()`);
  }
}
