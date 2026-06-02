import { MigrationInterface, QueryRunner } from 'typeorm';

const RBAC_GLOBAL_TABLES = [
  'roles',
  'permissions',
  'role_permissions',
] as const;

function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

export class HardenRbacCatalogRls1709000000190 implements MigrationInterface {
  name = 'HardenRbacCatalogRls1709000000190';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const tableName of RBAC_GLOBAL_TABLES) {
      if (!(await queryRunner.hasTable(tableName))) {
        continue;
      }

      const table = quoteIdent(tableName);

      await queryRunner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      await queryRunner.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);

      await queryRunner.query(
        `DROP POLICY IF EXISTS "rls_global_read" ON ${table}`,
      );
      await queryRunner.query(
        `DROP POLICY IF EXISTS "rls_super_admin_insert" ON ${table}`,
      );
      await queryRunner.query(
        `DROP POLICY IF EXISTS "rls_super_admin_update" ON ${table}`,
      );
      await queryRunner.query(
        `DROP POLICY IF EXISTS "rls_super_admin_delete" ON ${table}`,
      );

      await queryRunner.query(
        `CREATE POLICY "rls_global_read" ON ${table} FOR SELECT USING (true)`,
      );
      await queryRunner.query(
        `CREATE POLICY "rls_super_admin_insert" ON ${table} FOR INSERT WITH CHECK (is_super_admin() = true)`,
      );
      await queryRunner.query(
        `CREATE POLICY "rls_super_admin_update" ON ${table} FOR UPDATE USING (is_super_admin() = true) WITH CHECK (is_super_admin() = true)`,
      );
      await queryRunner.query(
        `CREATE POLICY "rls_super_admin_delete" ON ${table} FOR DELETE USING (is_super_admin() = true)`,
      );
    }
  }

  public async down(): Promise<void> {
    // no-op intencional para não reduzir hardening de segurança em rollback.
  }
}
