import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cria a função SECURITY DEFINER `find_user_bridge` para uso em
 * AuthPrincipalService.lookupUserBridge().
 *
 * Após migration 361 (REVOKE sgs_rls_bypass FROM sgs_app), o padrão
 * de CTE com `set_config('app.is_super_admin', 'true', true)` deixou de
 * bypassar RLS — is_super_admin() exige pg_has_role(current_user,
 * 'sgs_rls_bypass', 'MEMBER') = true, o que sgs_app não tem mais.
 *
 * A função roda com os privilégios do owner (BYPASSRLS) sem exigir que
 * sgs_app seja membro de sgs_rls_bypass, seguindo o mesmo padrão de
 * find_login_user (migration 359).
 */
export class CreateUserBridgeSecurityDefinerFunction1709000000362
  implements MigrationInterface
{
  name = 'CreateUserBridgeSecurityDefinerFunction1709000000362';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.find_user_bridge(
        p_app_user_id  uuid DEFAULT NULL,
        p_auth_user_id uuid DEFAULT NULL
      )
      RETURNS TABLE (
        id               uuid,
        auth_user_id     uuid,
        cpf              character varying,
        cpf_ciphertext   text,
        company_id       uuid,
        site_id          uuid,
        site_ids         uuid[],
        profile_nome     character varying
      )
      LANGUAGE sql
      SECURITY DEFINER
      SET search_path = public
      AS $$
        SELECT
          u.id,
          u.auth_user_id,
          u.cpf,
          u.cpf_ciphertext,
          u.company_id,
          u.site_id,
          COALESCE(
            ARRAY_AGG(us.site_id ORDER BY us.created_at)
              FILTER (WHERE us.site_id IS NOT NULL),
            ARRAY[]::uuid[]
          ) AS site_ids,
          p.nome AS profile_nome
        FROM users u
        LEFT JOIN profiles p
          ON p.id = u.profile_id
        LEFT JOIN user_sites us
          ON us.user_id = u.id
         AND us.company_id = u.company_id
        WHERE u.status = true
          AND u.deleted_at IS NULL
          AND (
            (p_auth_user_id IS NOT NULL AND u.auth_user_id = p_auth_user_id)
            OR (p_app_user_id IS NOT NULL AND u.id = p_app_user_id)
          )
        GROUP BY
          u.id, u.auth_user_id, u.cpf, u.cpf_ciphertext,
          u.company_id, u.site_id, p.nome
        ORDER BY
          CASE
            WHEN p_auth_user_id IS NOT NULL AND u.auth_user_id = p_auth_user_id
              THEN 0
            ELSE 1
          END
        LIMIT 1;
      $$;
    `);

    await queryRunner.query(`
      GRANT EXECUTE ON FUNCTION public.find_user_bridge(uuid, uuid) TO sgs_app
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP FUNCTION IF EXISTS public.find_user_bridge(uuid, uuid)
    `);
  }
}
