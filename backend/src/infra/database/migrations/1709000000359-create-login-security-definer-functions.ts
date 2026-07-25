import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 1c do hardening de bypass de RLS.
 *
 * O login busca o usuário por CPF sem tenant definido, usando
 * `SET LOCAL app.is_super_admin = 'true'` na conexão sgs_app.
 * Isso só funciona enquanto sgs_app for membro de sgs_rls_bypass.
 * Após o REVOKE (migration 361), a busca retornaria 0 linhas e o login
 * quebraria para todos.
 *
 * Solução: funções SECURITY DEFINER de propriedade do owner (BYPASSRLS).
 * A sgs_app executa as funções, mas elas rodam com os privilégios do owner —
 * sem precisar de membership em sgs_rls_bypass.
 *
 * Funções criadas:
 *   - find_login_user(cpf_hash, cpf_legacy)  → dados do usuário para login
 *   - update_login_user_password_hash(user_id, new_hash) → rehash bcrypt→argon2id
 */
export class CreateLoginSecurityDefinerFunctions1709000000359
  implements MigrationInterface
{
  name = 'CreateLoginSecurityDefinerFunctions1709000000359';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Lookup de usuário por CPF para o fluxo de login (cross-tenant por natureza).
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.find_login_user(
        p_cpf_hash  text,
        p_cpf_legacy text DEFAULT NULL
      )
      RETURNS TABLE (
        id                 uuid,
        nome               character varying,
        cpf                character varying,
        cpf_ciphertext     text,
        email              character varying,
        funcao             character varying,
        password           character varying,
        auth_user_id       uuid,
        company_id         uuid,
        site_id            uuid,
        profile_id         uuid,
        status             boolean,
        must_change_password boolean,
        profile_nome       character varying
      )
      LANGUAGE sql
      SECURITY DEFINER
      SET search_path = public
      AS $$
        SELECT
          u.id,
          u.nome,
          u.cpf,
          u.cpf_ciphertext,
          u.email,
          u.funcao,
          u.password,
          u.auth_user_id,
          u.company_id,
          u.site_id,
          u.profile_id,
          u.status,
          u.must_change_password,
          p.nome AS profile_nome
        FROM users u
        LEFT JOIN profiles p ON p.id = u.profile_id
        WHERE (
          u.cpf_hash = p_cpf_hash
          OR (p_cpf_legacy IS NOT NULL AND u.cpf = p_cpf_legacy)
        )
          AND u.deleted_at IS NULL
        LIMIT 1;
      $$;
    `);

    await queryRunner.query(`
      GRANT EXECUTE ON FUNCTION public.find_login_user(text, text) TO sgs_app
    `);

    // Atualiza o hash de senha durante o rehash transparente bcrypt→argon2id
    // no login (fire-and-forget). Roda como owner, sem precisar de bypass.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.update_login_user_password_hash(
        p_user_id  uuid,
        p_new_hash text
      )
      RETURNS void
      LANGUAGE sql
      SECURITY DEFINER
      SET search_path = public
      AS $$
        UPDATE users
        SET password = p_new_hash
        WHERE id = p_user_id
          AND deleted_at IS NULL;
      $$;
    `);

    await queryRunner.query(`
      GRANT EXECUTE ON FUNCTION public.update_login_user_password_hash(uuid, text) TO sgs_app
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP FUNCTION IF EXISTS public.update_login_user_password_hash(uuid, text)
    `);
    await queryRunner.query(`
      DROP FUNCTION IF EXISTS public.find_login_user(text, text)
    `);
  }
}
