import { MigrationInterface, QueryRunner } from 'typeorm';

const COMPANY_SCOPED_TABLES = [
  'aprs',
  'arrs',
  'audits',
  'cats',
  'checklists',
  'corrective_actions',
  'dashboard_document_availability_snapshots',
  'dashboard_query_snapshots',
  'dds',
  'dids',
  'epi_assignments',
  'inspections',
  'monthly_snapshots',
  'nonconformities',
  'pts',
  'rdos',
  'service_orders',
] as const;

export class RestoreRuntimeTenantPermissiveRlsPolicies1709000000177
  implements MigrationInterface
{
  name = 'RestoreRuntimeTenantPermissiveRlsPolicies1709000000177';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const tableName of COMPANY_SCOPED_TABLES) {
      await this.createPolicyIfManageable(
        queryRunner,
        tableName,
        'company_id = current_company() OR is_super_admin() = true',
      );
    }

    await this.createPolicyIfManageable(
      queryRunner,
      'audit_logs',
      '("companyId")::text = (current_company())::text OR is_super_admin() = true',
    );

    await this.createPolicyIfManageable(
      queryRunner,
      'apr_risk_evidences',
      `is_super_admin() = true OR EXISTS (
        SELECT 1
          FROM aprs a
         WHERE a.id = apr_risk_evidences.apr_id
           AND a.company_id = current_company()
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const tableName of [
      ...COMPANY_SCOPED_TABLES,
      'audit_logs',
      'apr_risk_evidences',
    ] as const) {
      if (!(await this.canManageTablePolicies(queryRunner, tableName))) {
        continue;
      }

      await queryRunner.query(`
        DROP POLICY IF EXISTS "${tableName}_runtime_tenant_access_policy"
        ON "${tableName}"
      `);
    }
  }

  private async createPolicyIfManageable(
    queryRunner: QueryRunner,
    tableName: string,
    expression: string,
  ): Promise<void> {
    if (!(await this.canManageTablePolicies(queryRunner, tableName))) {
      return;
    }

    await queryRunner.query(`
      DROP POLICY IF EXISTS "${tableName}_runtime_tenant_access_policy"
      ON "${tableName}"
    `);
    await queryRunner.query(`
      CREATE POLICY "${tableName}_runtime_tenant_access_policy"
      ON "${tableName}"
      AS PERMISSIVE
      FOR ALL
      TO sgs_app
      USING (${expression})
      WITH CHECK (${expression})
    `);
  }

  private async canManageTablePolicies(
    queryRunner: QueryRunner,
    tableName: string,
  ): Promise<boolean> {
    if (!(await queryRunner.hasTable(tableName))) {
      return false;
    }

    const rows = (await queryRunner.query(
      `
        SELECT pg_has_role(current_user, c.relowner, 'MEMBER') AS can_manage
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = current_schema()
           AND c.relname = $1
         LIMIT 1
      `,
      [tableName],
    )) as Array<{ can_manage: boolean }>;

    return rows[0]?.can_manage === true;
  }
}
