import { MigrationInterface, QueryRunner } from 'typeorm';

export class HardenDisasterRecoveryAndPrivacyRls1709000000166 implements MigrationInterface {
  name = 'HardenDisasterRecoveryAndPrivacyRls1709000000166';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO permissions (name, description)
      VALUES (
        'can_manage_disaster_recovery',
        'Permite executar backup, restore e consultas operacionais de disaster recovery'
      )
      ON CONFLICT (name) DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permissions p
      WHERE r.name IN ('Administrador Geral', 'ADMIN_GERAL')
        AND p.name = 'can_manage_disaster_recovery'
      ON CONFLICT (role_id, permission_id) DO NOTHING
    `);

    await queryRunner.query(`
      DROP POLICY IF EXISTS "tenant_isolation_privacy_requests"
      ON "privacy_requests"
    `);
    await queryRunner.query(`
      CREATE POLICY "tenant_isolation_privacy_requests"
      ON "privacy_requests"
      USING (
        "company_id" = current_company()
        OR is_super_admin() = true
      )
      WITH CHECK (
        "company_id" = current_company()
        OR is_super_admin() = true
      )
    `);

    await queryRunner.query(`
      DROP POLICY IF EXISTS "tenant_isolation_privacy_request_events"
      ON "privacy_request_events"
    `);
    await queryRunner.query(`
      CREATE POLICY "tenant_isolation_privacy_request_events"
      ON "privacy_request_events"
      USING (
        "company_id" = current_company()
        OR is_super_admin() = true
      )
      WITH CHECK (
        "company_id" = current_company()
        OR is_super_admin() = true
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP POLICY IF EXISTS "tenant_isolation_privacy_request_events"
      ON "privacy_request_events"
    `);
    await queryRunner.query(`
      CREATE POLICY "tenant_isolation_privacy_request_events"
      ON "privacy_request_events"
      USING (
        "company_id" = current_company()
        OR is_super_admin()
      )
      WITH CHECK (
        "company_id" = current_company()
        OR is_super_admin()
      )
    `);

    await queryRunner.query(`
      DROP POLICY IF EXISTS "tenant_isolation_privacy_requests"
      ON "privacy_requests"
    `);
    await queryRunner.query(`
      CREATE POLICY "tenant_isolation_privacy_requests"
      ON "privacy_requests"
      USING (
        "company_id" = current_company()
        OR is_super_admin()
      )
      WITH CHECK (
        "company_id" = current_company()
        OR is_super_admin()
      )
    `);

    await queryRunner.query(`
      DELETE FROM role_permissions
      WHERE permission_id IN (
        SELECT id FROM permissions
        WHERE name = 'can_manage_disaster_recovery'
      )
    `);
    await queryRunner.query(`
      DELETE FROM permissions
      WHERE name = 'can_manage_disaster_recovery'
    `);
  }
}
