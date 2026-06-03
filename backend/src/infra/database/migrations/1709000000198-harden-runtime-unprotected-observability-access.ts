import { MigrationInterface, QueryRunner } from 'typeorm';

const RUNTIME_ROLE = 'sgs_app';

const UNPROTECTED_RUNTIME_DENYLIST = [
  'apr_risk_rankings',
  'company_dashboard_metrics',
  'pg_stat_statements',
  'pg_stat_statements_info',
] as const;

const GLOBAL_RUNTIME_READ_ONLY_TABLES = [
  'consent_versions',
  'migrations',
] as const;

export class HardenRuntimeUnprotectedObservabilityAccess1709000000198 implements MigrationInterface {
  name = 'HardenRuntimeUnprotectedObservabilityAccess1709000000198';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const runtimeRoleExists = await this.roleExists(queryRunner, RUNTIME_ROLE);
    if (!runtimeRoleExists) {
      return;
    }

    for (const relationName of UNPROTECTED_RUNTIME_DENYLIST) {
      if (!(await this.relationExists(queryRunner, relationName))) {
        continue;
      }

      await queryRunner.query(
        `REVOKE ALL PRIVILEGES ON TABLE ${this.quoteIdentifier(relationName)} FROM ${RUNTIME_ROLE}`,
      );
      await queryRunner.query(
        `REVOKE ALL PRIVILEGES ON TABLE ${this.quoteIdentifier(relationName)} FROM PUBLIC`,
      );
    }

    for (const tableName of GLOBAL_RUNTIME_READ_ONLY_TABLES) {
      if (!(await this.relationExists(queryRunner, tableName))) {
        continue;
      }

      await queryRunner.query(
        `REVOKE INSERT, UPDATE, DELETE ON TABLE ${this.quoteIdentifier(tableName)} FROM ${RUNTIME_ROLE}`,
      );
      await queryRunner.query(
        `GRANT SELECT ON TABLE ${this.quoteIdentifier(tableName)} TO ${RUNTIME_ROLE}`,
      );
    }

    await this.hardenMailLogPartitions(queryRunner);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No-op intencional: rollback automatico reabriria acesso runtime a objetos
    // sem RLS. Reversao, se necessaria, deve ser uma decisao operacional explicita.
  }

  private async roleExists(
    queryRunner: QueryRunner,
    roleName: string,
  ): Promise<boolean> {
    const rows = (await queryRunner.query(
      `SELECT 1 FROM pg_roles WHERE rolname = $1 LIMIT 1`,
      [roleName],
    )) as Array<Record<string, unknown>>;

    return rows.length > 0;
  }

  private async relationExists(
    queryRunner: QueryRunner,
    relationName: string,
  ): Promise<boolean> {
    const rows = (await queryRunner.query(
      `SELECT to_regclass($1) AS relation_name`,
      [`public.${relationName}`],
    )) as Array<{ relation_name?: string | null }>;

    return typeof rows[0]?.relation_name === 'string';
  }

  private async hardenMailLogPartitions(
    queryRunner: QueryRunner,
  ): Promise<void> {
    const rows = (await queryRunner.query(
      `
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND (
          c.relname = 'mail_logs'
          OR c.oid IN (
            SELECT i.inhrelid
            FROM pg_inherits i
            JOIN pg_class parent ON parent.oid = i.inhparent
            JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
            WHERE parent_ns.nspname = 'public'
              AND parent.relname = 'mail_logs'
          )
        )
      ORDER BY c.relname
      `,
    )) as Array<{ relname?: string }>;

    for (const row of rows) {
      if (!row.relname) {
        continue;
      }

      const relationName = this.quoteIdentifier(row.relname);
      await queryRunner.query(
        `ALTER TABLE ${relationName} ENABLE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(
        `ALTER TABLE ${relationName} FORCE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(
        `DROP POLICY IF EXISTS "tenant_isolation_policy" ON ${relationName}`,
      );
      await queryRunner.query(`
        CREATE POLICY "tenant_isolation_policy"
        ON ${relationName}
        FOR ALL
        TO ${RUNTIME_ROLE}
        USING (
          "company_id" = current_company()
          OR is_super_admin() = true
        )
        WITH CHECK (
          "company_id" = current_company()
          OR is_super_admin() = true
        )
      `);
    }
  }

  private quoteIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }
}
