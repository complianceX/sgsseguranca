import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * MIGRATION GATE — executar apenas após validação completa do rollout.
 *
 * Revoga a membership de sgs_app no papel sgs_rls_bypass, completando o
 * hardening de isolamento multi-tenant. Após este REVOKE:
 *
 *   - is_super_admin() sempre retorna false para conexões sgs_app
 *     (pg_has_role(current_user, 'sgs_rls_bypass', 'MEMBER') = false)
 *   - SET LOCAL app.is_super_admin = 'true' não tem mais efeito prático
 *   - Operações privilegiadas legítimas devem usar PrivilegedDbService (sgs_admin)
 *     ou funções SECURITY DEFINER (find_login_user, update_login_user_password_hash)
 *
 * PRÉ-REQUISITOS obrigatórios (ver RUNBOOK_RLS_BYPASS_HARDENING.md):
 *   1. Migrations 359 e 360 aplicadas e validadas em produção
 *   2. DATABASE_ADMIN_URL configurada no Coolify (sgs_admin role)
 *   3. Login validado (find_login_user em uso no auth.service.ts)
 *   4. LGPD, cleanup e tenant-validation roteados para PrivilegedDbService
 *   5. ForensicTrailService sem prepareInternalAppendContext
 *   6. Smoke tests de login, DDS, APR, LGPD aprovados
 *
 * ROLLBACK: re-concede o membership — conexões existentes precisam de
 * novo pool.connect() para efetivar (ou reiniciar o processo).
 */
export class RevokeRlsBypassFromSgsApp1709000000361
  implements MigrationInterface
{
  name = 'RevokeRlsBypassFromSgsApp1709000000361';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sgs_app')
           AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sgs_rls_bypass') THEN
          REVOKE sgs_rls_bypass FROM sgs_app;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sgs_app')
           AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sgs_rls_bypass') THEN
          GRANT sgs_rls_bypass TO sgs_app;
        END IF;
      END $$;
    `);
  }
}
