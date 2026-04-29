import { MigrationInterface, QueryRunner } from 'typeorm';

const FORENSIC_SECURITY_RLS_CONDITION = `
  (
    (company_id)::text = (current_company())::text
    OR is_super_admin() = true
    OR (
      company_id IS NULL
      AND module = 'security'
      AND event_type IN ('LOGIN_FAILED', 'MFA_FAILED')
    )
  )
`;

export class AllowGlobalSecurityForensicEvents1709000000176
  implements MigrationInterface
{
  name = 'AllowGlobalSecurityForensicEvents1709000000176';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('forensic_trail_events'))) {
      return;
    }

    await queryRunner.query(`
      DROP POLICY IF EXISTS "tenant_isolation_policy" ON "forensic_trail_events"
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS "rls_forensic_company_isolation" ON "forensic_trail_events"
    `);

    await queryRunner.query(`
      CREATE POLICY "tenant_isolation_policy"
      ON "forensic_trail_events"
      AS PERMISSIVE
      FOR ALL
      USING ${FORENSIC_SECURITY_RLS_CONDITION}
      WITH CHECK ${FORENSIC_SECURITY_RLS_CONDITION}
    `);

    await queryRunner.query(`
      CREATE POLICY "rls_forensic_company_isolation"
      ON "forensic_trail_events"
      AS RESTRICTIVE
      FOR ALL
      USING ${FORENSIC_SECURITY_RLS_CONDITION}
      WITH CHECK ${FORENSIC_SECURITY_RLS_CONDITION}
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('forensic_trail_events'))) {
      return;
    }

    await queryRunner.query(`
      DROP POLICY IF EXISTS "tenant_isolation_policy" ON "forensic_trail_events"
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS "rls_forensic_company_isolation" ON "forensic_trail_events"
    `);

    await queryRunner.query(`
      CREATE POLICY "tenant_isolation_policy"
      ON "forensic_trail_events"
      AS PERMISSIVE
      FOR ALL
      USING ((company_id)::text = (current_company())::text OR is_super_admin() = true)
      WITH CHECK ((company_id)::text = (current_company())::text OR is_super_admin() = true)
    `);

    await queryRunner.query(`
      CREATE POLICY "rls_forensic_company_isolation"
      ON "forensic_trail_events"
      AS RESTRICTIVE
      FOR ALL
      USING ((company_id)::text = (current_company())::text OR is_super_admin() = true)
      WITH CHECK ((company_id)::text = (current_company())::text OR is_super_admin() = true)
    `);
  }
}
