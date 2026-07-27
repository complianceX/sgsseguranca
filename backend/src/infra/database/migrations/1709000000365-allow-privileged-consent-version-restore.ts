import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Permite que o papel administrativo dedicado restaure versões globais de
 * consentimento referenciadas pelos registros do tenant.
 *
 * `consent_versions` continua somente leitura para `sgs_app`: a função
 * `is_super_admin()` exige que a sessão pertença a `sgs_rls_bypass`, papel
 * revogado de `sgs_app` pela migration 361 e mantido apenas em `sgs_admin`.
 */
export class AllowPrivilegedConsentVersionRestore1709000000365 implements MigrationInterface {
  name = 'AllowPrivilegedConsentVersionRestore1709000000365';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('consent_versions'))) {
      return;
    }

    await queryRunner.query(
      `ALTER TABLE "consent_versions" ENABLE ROW LEVEL SECURITY`,
    );

    await queryRunner.query(
      `DROP POLICY IF EXISTS "consent_versions_super_admin_insert" ON "consent_versions"`,
    );
    await queryRunner.query(`
      CREATE POLICY "consent_versions_super_admin_insert"
      ON "consent_versions"
      FOR INSERT
      WITH CHECK (is_super_admin() = true)
    `);

    await queryRunner.query(
      `DROP POLICY IF EXISTS "consent_versions_super_admin_update" ON "consent_versions"`,
    );
    await queryRunner.query(`
      CREATE POLICY "consent_versions_super_admin_update"
      ON "consent_versions"
      FOR UPDATE
      USING (is_super_admin() = true)
      WITH CHECK (is_super_admin() = true)
    `);

    await queryRunner.query(
      `DROP POLICY IF EXISTS "consent_versions_super_admin_delete" ON "consent_versions"`,
    );
    await queryRunner.query(`
      CREATE POLICY "consent_versions_super_admin_delete"
      ON "consent_versions"
      FOR DELETE
      USING (is_super_admin() = true)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('consent_versions'))) {
      return;
    }

    await queryRunner.query(
      `DROP POLICY IF EXISTS "consent_versions_super_admin_delete" ON "consent_versions"`,
    );
    await queryRunner.query(
      `DROP POLICY IF EXISTS "consent_versions_super_admin_update" ON "consent_versions"`,
    );
    await queryRunner.query(
      `DROP POLICY IF EXISTS "consent_versions_super_admin_insert" ON "consent_versions"`,
    );
  }
}
