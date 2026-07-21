import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Converte `companies.deleted_at` para TIMESTAMPTZ.
 *
 * REPRODUTIBILIDADE (corrigido após auditoria de banco)
 *   Num banco criado do zero (Disaster Recovery, novo ambiente) o ALTER falhava
 *   com "não é possível alterar o tipo de dados de uma coluna usada por uma
 *   visão ou regra": a view materializada `company_dashboard_metrics` (criada
 *   pela migration 088) referencia `companies.deleted_at`, e o PostgreSQL
 *   bloqueia a alteração enquanto a dependência existir.
 *
 *   A migration passa a remover temporariamente as views materializadas
 *   dependentes e recriá-las exatamente como estavam — definição, índices e
 *   permissões — logo após a conversão.
 *
 *   A descoberta é dinâmica (via pg_depend), então qualquer view materializada
 *   que passe a depender da coluna no futuro é tratada automaticamente, sem
 *   hardcode de nomes.
 */
export class FixCompaniesDeletedAtTimezone1709000000317
  implements MigrationInterface
{
  name = 'FixCompaniesDeletedAtTimezone1709000000317';

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.alterPreservingDependentMatviews(
      queryRunner,
      `ALTER TABLE public.companies ALTER COLUMN "deleted_at" TYPE TIMESTAMPTZ`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await this.alterPreservingDependentMatviews(
      queryRunner,
      `ALTER TABLE public.companies ALTER COLUMN "deleted_at" TYPE TIMESTAMP`,
    );
  }

  /**
   * Executa `action` com as views materializadas que dependem de
   * `companies.deleted_at` temporariamente removidas, restaurando-as depois
   * (definição + índices + grants).
   */
  private async alterPreservingDependentMatviews(
    queryRunner: QueryRunner,
    action: string,
  ): Promise<void> {
    await queryRunner.query(`
      DO $do$
      DECLARE
        mv record;
        defs text[] := ARRAY[]::text[];
        stmt text;
      BEGIN
        FOR mv IN
          SELECT DISTINCT cl.oid AS oid, cl.relname AS relname
          FROM pg_depend d
          JOIN pg_rewrite r   ON r.oid = d.objid
          JOIN pg_class cl    ON cl.oid = r.ev_class
          JOIN pg_class src   ON src.oid = d.refobjid
          JOIN pg_attribute a ON a.attrelid = src.oid AND a.attnum = d.refobjsubid
          JOIN pg_namespace n ON n.oid = src.relnamespace
          WHERE n.nspname   = 'public'
            AND src.relname = 'companies'
            AND a.attname   = 'deleted_at'
            AND cl.relkind  = 'm'
        LOOP
          -- 1) definição da matview
          defs := defs || format(
            'CREATE MATERIALIZED VIEW public.%I AS %s',
            mv.relname,
            pg_get_viewdef(mv.oid)
          );

          -- 2) índices
          defs := defs || (
            SELECT coalesce(array_agg(i.indexdef), ARRAY[]::text[])
            FROM pg_indexes i
            WHERE i.schemaname = 'public' AND i.tablename = mv.relname
          );

          -- 3) permissões explícitas
          defs := defs || (
            SELECT coalesce(
              array_agg(DISTINCT format(
                'GRANT %s ON public.%I TO %I',
                g.privilege_type, mv.relname, g.grantee
              )),
              ARRAY[]::text[]
            )
            FROM information_schema.role_table_grants g
            WHERE g.table_schema = 'public'
              AND g.table_name   = mv.relname
              AND g.grantee <> current_user
          );

          EXECUTE format('DROP MATERIALIZED VIEW public.%I', mv.relname);
        END LOOP;

        EXECUTE $act$${action}$act$;

        FOREACH stmt IN ARRAY defs LOOP
          EXECUTE stmt;
        END LOOP;
      END
      $do$;
    `);
  }
}
