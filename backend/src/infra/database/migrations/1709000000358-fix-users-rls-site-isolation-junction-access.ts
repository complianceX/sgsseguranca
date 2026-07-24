import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Corrige a policy RESTRICTIVE "users_site_isolation_policy" (migration 126)
 * para permitir que usuários com acesso a uma obra via tabela de junção
 * user_sites (obra não-primária) possam visualizar os funcionários dessa obra.
 *
 * Problema: TST com obra primária X selecionava obra Y no formulário de DDS
 * e via lista vazia, porque a policy bloqueava usuários cuja site_id ≠ X.
 * Jennifer (site_id = RWS) via os 9 funcionários; Gisley (site_id = Leroy Merlyn)
 * via apenas ele mesmo — mesmo ambos tendo acesso à obra RWS via user_sites.
 *
 * Fix: adiciona duas condições ao USING/WITH CHECK:
 *   1. OR site_id IS NULL   — usuários sem obra fixa são visíveis para todos da empresa
 *   2. OR EXISTS user_sites — usuário logado com acesso à obra Y pode ver funcionários de Y
 */
export class FixUsersRlsSiteIsolationJunctionAccess1709000000358
  implements MigrationInterface
{
  name = 'FixUsersRlsSiteIsolationJunctionAccess1709000000358';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('users'))) {
      return;
    }

    await queryRunner.query(`
      DROP POLICY IF EXISTS "users_site_isolation_policy" ON "users"
    `);

    await queryRunner.query(`
      CREATE POLICY "users_site_isolation_policy"
      ON "users"
      AS RESTRICTIVE
      FOR ALL
      USING (
        is_super_admin() = true
        OR (
          company_id = current_company()
          AND (
            current_site_scope() = 'all'
            OR id = current_app_user_id()
            OR site_id IS NULL
            OR site_id = current_site_id()
            OR EXISTS (
              SELECT 1 FROM user_sites us
              WHERE us.user_id = current_app_user_id()
                AND us.site_id = users.site_id
            )
          )
        )
      )
      WITH CHECK (
        is_super_admin() = true
        OR (
          company_id = current_company()
          AND (
            current_site_scope() = 'all'
            OR id = current_app_user_id()
            OR site_id IS NULL
            OR site_id = current_site_id()
            OR EXISTS (
              SELECT 1 FROM user_sites us
              WHERE us.user_id = current_app_user_id()
                AND us.site_id = users.site_id
            )
          )
        )
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('users'))) {
      return;
    }

    await queryRunner.query(`
      DROP POLICY IF EXISTS "users_site_isolation_policy" ON "users"
    `);

    await queryRunner.query(`
      CREATE POLICY "users_site_isolation_policy"
      ON "users"
      AS RESTRICTIVE
      FOR ALL
      USING (
        is_super_admin() = true
        OR (
          company_id = current_company()
          AND (
            current_site_scope() = 'all'
            OR id = current_app_user_id()
            OR site_id = current_site_id()
          )
        )
      )
      WITH CHECK (
        is_super_admin() = true
        OR (
          company_id = current_company()
          AND (
            current_site_scope() = 'all'
            OR id = current_app_user_id()
            OR site_id = current_site_id()
          )
        )
      )
    `);
  }
}
