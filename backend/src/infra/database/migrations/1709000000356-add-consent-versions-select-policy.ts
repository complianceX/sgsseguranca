import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `consent_versions` tinha ROW LEVEL SECURITY habilitada sem nenhuma policy.
 * No PostgreSQL isso nega todo acesso a papéis que não são donos da tabela —
 * inclusive SELECT. O defeito ficou latente enquanto o runtime conectava com um
 * papel BYPASSRLS; ao migrar a aplicação para o papel `sgs_app` (sem bypass),
 * a leitura passou a retornar zero linhas e derrubou o fluxo de consentimento
 * LGPD (FirstAccessConsentModal e AiConsentGuard).
 *
 * A tabela é global: não tem `company_id` e guarda os textos de política que são
 * publicados publicamente em /privacidade. Logo, a policy de leitura é irrestrita.
 *
 * Escrita continua vedada ao runtime — a migration 1709000000171 revogou
 * INSERT/UPDATE/DELETE de `sgs_app` de propósito. Novas versões de política são
 * publicadas por migration, com o papel owner. O ConsentsSeederService já trata
 * a negação de escrita com skip gracioso (`consent_seed_skip`).
 */
export class AddConsentVersionsSelectPolicy1709000000356 implements MigrationInterface {
  name = 'AddConsentVersionsSelectPolicy1709000000356';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('consent_versions'))) {
      return;
    }

    await queryRunner.query(
      `ALTER TABLE "consent_versions" ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `DROP POLICY IF EXISTS "consent_versions_select_all" ON "consent_versions"`,
    );
    await queryRunner.query(`
      CREATE POLICY "consent_versions_select_all"
      ON "consent_versions"
      FOR SELECT
      USING (true)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('consent_versions'))) {
      return;
    }

    await queryRunner.query(
      `DROP POLICY IF EXISTS "consent_versions_select_all" ON "consent_versions"`,
    );
  }
}
