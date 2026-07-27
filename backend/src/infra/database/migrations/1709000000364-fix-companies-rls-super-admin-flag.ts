import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixCompaniesRlsSuperAdminFlag1709000000364 implements MigrationInterface {
  name = 'FixCompaniesRlsSuperAdminFlag1709000000364';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Após migration 361 (REVOKE sgs_rls_bypass FROM sgs_app), a função
    // is_super_admin() sempre retorna false para sgs_app — o check de role
    // bloqueia mesmo com app.is_super_admin = 'true'.
    // A policy companies_tenant_isolation usava is_super_admin(), o que impedia
    // ADMIN_GERAL de listar todas as empresas (via sgs_app) e queimava jobs
    // cross-tenant (runAsGlobalSuperAdmin com 0 resultados).
    // Fix: usar a flag de sessão diretamente em vez da função is_super_admin().
    // sgs_admin mantém acesso via companies_sgs_admin_access (migration 363).
    await queryRunner.query(`
      ALTER POLICY companies_tenant_isolation ON "companies"
        USING (
          (id = current_company())
          OR (current_setting('app.is_super_admin', true)::boolean = true)
        )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER POLICY companies_tenant_isolation ON "companies"
        USING (
          (id = current_company())
          OR (is_super_admin() = true)
        )
    `);
  }
}
