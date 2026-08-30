import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Remove as materialized views cross-tenant do alcance do runtime comum.
 *
 * Elas são snapshots globais sem RLS próprio. O acesso administrativo passa
 * pela conexão dedicada `sgs_admin`, com a flag de sessão já protegida por
 * membership em `sgs_rls_bypass`; `sgs_app` não recebe SELECT nem ownership.
 */
export class HardenMaterializedViewRuntimeAccess1709000000394 implements MigrationInterface {
  name = 'HardenMaterializedViewRuntimeAccess1709000000394';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const adminRoleRows = (await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_roles WHERE rolname = 'sgs_admin'
      ) AS role_present
    `)) as Array<{ role_present: boolean | string }>;
    const adminRolePresent =
      adminRoleRows[0]?.role_present === true ||
      adminRoleRows[0]?.role_present === 't' ||
      adminRoleRows[0]?.role_present === 'true';

    if (!adminRolePresent) {
      return;
    }

    const materializedViews = [
      'company_dashboard_metrics',
      'apr_risk_rankings',
    ] as const;
    const relationRows = (await queryRunner.query(`
      SELECT
        c.relname AS relation_name,
        c.relkind,
        owner_role.rolname AS owner
      FROM pg_class AS c
      JOIN pg_namespace AS relation_schema
        ON relation_schema.oid = c.relnamespace
      JOIN pg_roles AS owner_role
        ON owner_role.oid = c.relowner
      WHERE relation_schema.nspname = 'public'
        AND c.relname IN ('company_dashboard_metrics', 'apr_risk_rankings')
    `)) as Array<{
      relation_name: string;
      relkind: string;
      owner: string;
    }>;

    for (const relationName of materializedViews) {
      const relation = relationRows.find(
        ({ relation_name: name }) => name === relationName,
      );
      if (!relation) {
        continue;
      }
      if (relation.relkind !== 'm') {
        throw new Error(
          `0394 expected public.${relationName} to be a materialized view`,
        );
      }
      if (relation.owner === 'sgs_app') {
        throw new Error(
          `0394 refuses runtime-owned materialized view public.${relationName}`,
        );
      }
    }

    if (relationRows.length > 0) {
      for (const relationName of materializedViews) {
        if (
          !relationRows.some(({ relation_name: name }) => name === relationName)
        ) {
          continue;
        }
        await queryRunner.query(
          `REVOKE ALL PRIVILEGES ON TABLE public."${relationName}" FROM PUBLIC, sgs_app`,
        );
        await queryRunner.query(
          `GRANT SELECT, MAINTAIN ON TABLE public."${relationName}" TO sgs_admin`,
        );
      }
    }

    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass('public.companies') IS NOT NULL THEN
          GRANT SELECT ON TABLE public.companies TO sgs_admin;
        END IF;
        IF to_regclass('public.aprs') IS NOT NULL THEN
          GRANT SELECT ON TABLE public.aprs TO sgs_admin;
        END IF;
        IF to_regclass('public.pts') IS NOT NULL THEN
          GRANT SELECT ON TABLE public.pts TO sgs_admin;
        END IF;
        IF to_regclass('public.nonconformities') IS NOT NULL THEN
          GRANT SELECT ON TABLE public.nonconformities TO sgs_admin;
        END IF;
        IF to_regclass('public.trainings') IS NOT NULL THEN
          GRANT SELECT ON TABLE public.trainings TO sgs_admin;
        END IF;
      END $$;
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Não reabre acesso cross-tenant ao runtime em rollback automático.
  }
}
