import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixSgsAdminCompaniesRlsPolicy1709000000363
  implements MigrationInterface
{
  name = 'FixSgsAdminCompaniesRlsPolicy1709000000363';

  async up(queryRunner: QueryRunner): Promise<void> {
    // sgs_admin é o role usado pelo PrivilegedDbService para operações cross-tenant
    // (validação de tenant, backup, etc). A tabela companies tem FORCE RLS habilitado
    // e a única policy existente (companies_tenant_isolation) cobre apenas sgs_app.
    // Sem uma policy para sgs_admin, todas as queries retornam 0 linhas → 401.
    await queryRunner.query(`
      CREATE POLICY companies_sgs_admin_access
        ON "companies"
        FOR ALL
        TO sgs_admin
        USING (true)
        WITH CHECK (true)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP POLICY IF EXISTS companies_sgs_admin_access ON "companies"
    `);
  }
}
