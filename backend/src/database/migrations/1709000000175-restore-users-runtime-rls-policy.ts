import { MigrationInterface, QueryRunner } from 'typeorm';

export class RestoreUsersRuntimeRlsPolicy1709000000175
  implements MigrationInterface
{
  name = 'RestoreUsersRuntimeRlsPolicy1709000000175';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('users'))) {
      return;
    }

    await queryRunner.query(`
      DROP POLICY IF EXISTS "users_runtime_tenant_access_policy" ON "users"
    `);

    await queryRunner.query(`
      CREATE POLICY "users_runtime_tenant_access_policy"
      ON "users"
      AS PERMISSIVE
      FOR ALL
      TO sgs_app
      USING (company_id = current_company() OR is_super_admin() = true)
      WITH CHECK (company_id = current_company() OR is_super_admin() = true)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('users'))) {
      return;
    }

    await queryRunner.query(`
      DROP POLICY IF EXISTS "users_runtime_tenant_access_policy" ON "users"
    `);
  }
}
