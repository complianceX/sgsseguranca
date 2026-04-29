import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveBroadUsersSitesRlsPolicies1709000000174
  implements MigrationInterface
{
  name = 'RemoveBroadUsersSitesRlsPolicies1709000000174';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const tableName of ['users', 'sites']) {
      if (!(await queryRunner.hasTable(tableName))) {
        continue;
      }

      await queryRunner.query(
        `DROP POLICY IF EXISTS "tenant_isolation_policy" ON "${tableName}"`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('users')) {
      await queryRunner.query(`
        CREATE POLICY "tenant_isolation_policy"
        ON "users"
        FOR ALL
        USING (company_id = current_company() OR is_super_admin() = true)
        WITH CHECK (company_id = current_company() OR is_super_admin() = true)
      `);
    }

    if (await queryRunner.hasTable('sites')) {
      await queryRunner.query(`
        CREATE POLICY "tenant_isolation_policy"
        ON "sites"
        FOR ALL
        USING (company_id = current_company() OR is_super_admin() = true)
        WITH CHECK (company_id = current_company() OR is_super_admin() = true)
      `);
    }
  }
}
