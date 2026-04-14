import { MigrationInterface, QueryRunner } from 'typeorm';

export class HardenSitesRls1709000000128 implements MigrationInterface {
  name = 'HardenSitesRls1709000000128';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sites" ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE "sites" FORCE ROW LEVEL SECURITY`,
    );

    await queryRunner.query(`
      DROP POLICY IF EXISTS "sites_tenant_select_policy" ON "sites";
      CREATE POLICY "sites_tenant_select_policy"
      ON "sites"
      FOR SELECT
      USING (
        is_super_admin() = true
        OR (
          company_id = current_company()
          AND (
            current_site_scope() = 'all'
            OR id = current_site_id()
          )
        )
      )
    `);

    await queryRunner.query(`
      DROP POLICY IF EXISTS "sites_tenant_insert_policy" ON "sites";
      CREATE POLICY "sites_tenant_insert_policy"
      ON "sites"
      FOR INSERT
      WITH CHECK (
        is_super_admin() = true
        OR (
          company_id = current_company()
          AND current_site_scope() = 'all'
        )
      )
    `);

    await queryRunner.query(`
      DROP POLICY IF EXISTS "sites_tenant_update_policy" ON "sites";
      CREATE POLICY "sites_tenant_update_policy"
      ON "sites"
      FOR UPDATE
      USING (
        is_super_admin() = true
        OR (
          company_id = current_company()
          AND (
            current_site_scope() = 'all'
            OR id = current_site_id()
          )
        )
      )
      WITH CHECK (
        is_super_admin() = true
        OR (
          company_id = current_company()
          AND (
            current_site_scope() = 'all'
            OR id = current_site_id()
          )
        )
      )
    `);

    await queryRunner.query(`
      DROP POLICY IF EXISTS "sites_tenant_delete_policy" ON "sites";
      CREATE POLICY "sites_tenant_delete_policy"
      ON "sites"
      FOR DELETE
      USING (
        is_super_admin() = true
        OR (
          company_id = current_company()
          AND (
            current_site_scope() = 'all'
            OR id = current_site_id()
          )
        )
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP POLICY IF EXISTS "sites_tenant_delete_policy" ON "sites"`);
    await queryRunner.query(`DROP POLICY IF EXISTS "sites_tenant_update_policy" ON "sites"`);
    await queryRunner.query(`DROP POLICY IF EXISTS "sites_tenant_insert_policy" ON "sites"`);
    await queryRunner.query(`DROP POLICY IF EXISTS "sites_tenant_select_policy" ON "sites"`);
    await queryRunner.query(`ALTER TABLE "sites" NO FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "sites" DISABLE ROW LEVEL SECURITY`);
  }
}
