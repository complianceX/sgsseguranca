import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SECURITY (A1 — escalação de privilégio no bypass de RLS).
 *
 * PROBLEMA
 *   `is_super_admin()` decidia o bypass de RLS lendo apenas a variável de sessão
 *   `app.is_super_admin`. Qualquer sessão conectada com o papel de runtime podia
 *   executar `SELECT set_config('app.is_super_admin','true',false)` e passar a
 *   enxergar/alterar dados de TODOS os tenants.
 *
 *   Validado empiricamente em auditoria: com o papel de runtime (NOBYPASSRLS),
 *   após o `set_config` a sessão passou a ver os dados de 2 tenants distintos.
 *
 *   Não era explorável pela aplicação (não há SQL injection e o pool reescreve o
 *   contexto a cada conexão), mas removia a última barreira: uma única injection
 *   futura — ou o vazamento da DATABASE_URL — elevaria o impacto de "um tenant"
 *   para "todos os tenants".
 *
 * CORREÇÃO
 *   O bypass passa a exigir DUAS condições independentes:
 *     1. a flag de sessão `app.is_super_admin`; e
 *     2. que a sessão esteja autenticada com um papel membro de `sgs_rls_bypass`.
 *
 *   Assim, conhecer/alterar a variável de sessão deixa de ser suficiente: é
 *   preciso possuir credenciais de um papel privilegiado.
 *
 * COMPATIBILIDADE (importante para o rollout)
 *   Esta migration concede `sgs_rls_bypass` ao papel de runtime para NÃO quebrar
 *   as telas de super admin (visão global) no momento da aplicação. Nesse estado
 *   a infraestrutura está pronta, porém o hardening ainda NÃO está completo.
 *
 *   Para concluir o hardening (etapa 2, operacional):
 *     a) criar um papel dedicado com login próprio, ex.:
 *          CREATE ROLE sgs_admin LOGIN PASSWORD '<segredo>';
 *          GRANT sgs_rls_bypass TO sgs_admin;
 *        e apontar as operações de super admin para uma conexão que o utilize;
 *     b) revogar o bypass do runtime:
 *          REVOKE sgs_rls_bypass FROM sgs_app;
 *
 *   A etapa (b) é o que efetivamente fecha o vetor. Enquanto o runtime for
 *   membro do grupo, o comportamento permanece idêntico ao atual.
 */
export class HardenRlsBypassRoleGate1709000000346 implements MigrationInterface {
  name = 'HardenRlsBypassRoleGate1709000000346';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Papel-grupo usado apenas como marcador de privilégio (sem login).
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sgs_rls_bypass') THEN
          CREATE ROLE sgs_rls_bypass NOLOGIN;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.is_super_admin()
      RETURNS boolean
      LANGUAGE plpgsql
      STABLE
      SET search_path TO 'public'
      AS $function$
      BEGIN
        -- A flag de sessão sozinha não concede bypass: a sessão precisa estar
        -- autenticada com um papel autorizado.
        IF NOT pg_has_role(current_user, 'sgs_rls_bypass', 'MEMBER') THEN
          RETURN false;
        END IF;

        RETURN coalesce(
          current_setting('app.is_super_admin', true)::boolean,
          false
        );
      EXCEPTION
        WHEN others THEN
          RETURN false;
      END;
      $function$;
    `);

    // Preserva o comportamento atual no momento da aplicação (ver COMPATIBILIDADE).
    // A revogação é feita na etapa 2, após a conexão dedicada existir.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sgs_app') THEN
          GRANT sgs_rls_bypass TO sgs_app;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restaura a definição anterior (bypass decidido apenas pela flag de sessão).
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.is_super_admin()
      RETURNS boolean
      LANGUAGE plpgsql
      STABLE
      SET search_path TO 'public'
      AS $function$
      BEGIN
        RETURN coalesce(
          current_setting('app.is_super_admin', true)::boolean,
          false
        );
      EXCEPTION
        WHEN others THEN
          RETURN false;
      END;
      $function$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sgs_app')
           AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sgs_rls_bypass') THEN
          REVOKE sgs_rls_bypass FROM sgs_app;
        END IF;
      END $$;
    `);

    // O papel-grupo é preservado propositalmente: outros papéis podem tê-lo.
  }
}
