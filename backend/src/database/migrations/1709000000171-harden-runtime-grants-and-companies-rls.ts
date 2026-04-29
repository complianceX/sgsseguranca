import { MigrationInterface, QueryRunner } from 'typeorm';

const RUNTIME_ROLE = 'sgs_app';

const TABLES_RUNTIME_READ_ONLY = [
  'migrations',
  'permissions',
  'roles',
  'role_permissions',
  'consent_versions',
] as const;

export class HardenRuntimeGrantsAndCompaniesRls1709000000171 implements MigrationInterface {
  name = 'HardenRuntimeGrantsAndCompaniesRls1709000000171';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const runtimeRoleExists = await this.roleExists(queryRunner, RUNTIME_ROLE);

    if (await queryRunner.hasTable('companies')) {
      await queryRunner.query(
        `ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(
        `ALTER TABLE "companies" FORCE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(
        `DROP POLICY IF EXISTS "companies_tenant_isolation" ON "companies"`,
      );
      await queryRunner.query(`
        CREATE POLICY "companies_tenant_isolation"
        ON "companies"
        FOR ALL
        ${runtimeRoleExists ? `TO ${RUNTIME_ROLE}` : ''}
        USING ("id" = current_company() OR is_super_admin() = true)
        WITH CHECK ("id" = current_company() OR is_super_admin() = true)
      `);
    }

    if (!runtimeRoleExists) {
      return;
    }

    for (const tableName of TABLES_RUNTIME_READ_ONLY) {
      if (!(await queryRunner.hasTable(tableName))) {
        continue;
      }

      await queryRunner.query(
        `REVOKE INSERT, UPDATE, DELETE ON TABLE "${tableName}" FROM ${RUNTIME_ROLE}`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const runtimeRoleExists = await this.roleExists(queryRunner, RUNTIME_ROLE);

    if (runtimeRoleExists) {
      for (const tableName of TABLES_RUNTIME_READ_ONLY) {
        if (!(await queryRunner.hasTable(tableName))) {
          continue;
        }

        await queryRunner.query(
          `GRANT INSERT, UPDATE, DELETE ON TABLE "${tableName}" TO ${RUNTIME_ROLE}`,
        );
      }
    }

    if (await queryRunner.hasTable('companies')) {
      await queryRunner.query(
        `DROP POLICY IF EXISTS "companies_tenant_isolation" ON "companies"`,
      );
      await queryRunner.query(
        `ALTER TABLE "companies" NO FORCE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(
        `ALTER TABLE "companies" DISABLE ROW LEVEL SECURITY`,
      );
    }
  }

  private async roleExists(
    queryRunner: QueryRunner,
    roleName: string,
  ): Promise<boolean> {
    const rows = (await queryRunner.query(
      `SELECT 1 FROM pg_roles WHERE rolname = $1 LIMIT 1`,
      [roleName],
    )) as Array<Record<string, unknown>>;

    return rows.length > 0;
  }
}
