import { MigrationInterface, QueryRunner } from 'typeorm';

function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

type Policy = {
  name: string;
  sql: string;
};

const GLOBAL_READ_TABLES = [
  'apr_rules',
  'data_retention_policies',
  'profiles',
  'system_theme',
] as const;

const OPERATIONAL_GLOBAL_TABLES = [
  'disaster_recovery_executions',
  'gdpr_retention_cleanup_runs',
] as const;

export class ClassifyWritableRuntimeRls1709000000187 implements MigrationInterface {
  name = 'ClassifyWritableRuntimeRls1709000000187';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const tableName of GLOBAL_READ_TABLES) {
      await this.enableGlobalReadSuperAdminWrite(queryRunner, tableName);
    }

    for (const tableName of OPERATIONAL_GLOBAL_TABLES) {
      await this.enableOperationalGlobalRuntimeAccess(queryRunner, tableName);
    }

    await this.enableTenantColumnPolicy(queryRunner, {
      tableName: 'apr_feature_flags',
      tenantColumn: 'tenantId',
      allowGlobalRead: true,
    });
    await this.enableTenantColumnPolicy(queryRunner, {
      tableName: 'apr_metrics',
      tenantColumn: 'tenantId',
      allowGlobalRead: false,
    });
    await this.enableTenantColumnPolicy(queryRunner, {
      tableName: 'apr_workflow_configs',
      tenantColumn: 'tenantId',
      allowGlobalRead: true,
    });
    await this.enableTenantColumnPolicy(queryRunner, {
      tableName: 'push_subscriptions',
      tenantColumn: 'tenantId',
      allowGlobalRead: false,
    });

    await this.enableParentTenantPolicy(queryRunner, {
      tableName: 'apr_approval_steps',
      parentTable: 'aprs',
      parentColumn: 'id',
      childColumn: 'apr_id',
      parentTenantColumn: 'company_id',
      allowGlobalParentRead: false,
    });
    await this.enableParentTenantPolicy(queryRunner, {
      tableName: 'apr_approval_records',
      parentTable: 'aprs',
      parentColumn: 'id',
      childColumn: 'aprId',
      parentTenantColumn: 'company_id',
      allowGlobalParentRead: false,
    });
    await this.enableParentTenantPolicy(queryRunner, {
      tableName: 'apr_workflow_steps',
      parentTable: 'apr_workflow_configs',
      parentColumn: 'id',
      childColumn: 'workflowConfigId',
      parentTenantColumn: 'tenantId',
      allowGlobalParentRead: true,
    });
    await this.enableParentTenantPolicy(queryRunner, {
      tableName: 'gdpr_deletion_requests',
      parentTable: 'users',
      parentColumn: 'id',
      childColumn: 'user_id',
      parentTenantColumn: 'company_id',
      allowGlobalParentRead: false,
    });
    await this.enableParentTenantPolicy(queryRunner, {
      tableName: 'rdo_audit_events',
      parentTable: 'rdos',
      parentColumn: 'id',
      childColumn: 'rdo_id',
      parentTenantColumn: 'company_id',
      allowGlobalParentRead: false,
    });
    await this.enableParentTenantPolicy(queryRunner, {
      tableName: 'risk_history',
      parentTable: 'risks',
      parentColumn: 'id',
      childColumn: 'risk_id',
      parentTenantColumn: 'company_id',
      allowGlobalParentRead: false,
    });
    await this.enableParentTenantPolicy(queryRunner, {
      tableName: 'user_roles',
      parentTable: 'users',
      parentColumn: 'id',
      childColumn: 'user_id',
      parentTenantColumn: 'company_id',
      allowGlobalParentRead: false,
    });
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      ...GLOBAL_READ_TABLES,
      ...OPERATIONAL_GLOBAL_TABLES,
      'apr_feature_flags',
      'apr_metrics',
      'apr_workflow_configs',
      'push_subscriptions',
      'apr_approval_steps',
      'apr_approval_records',
      'apr_workflow_steps',
      'gdpr_deletion_requests',
      'rdo_audit_events',
      'risk_history',
      'user_roles',
    ];

    for (const tableName of tables) {
      if (!(await queryRunner.hasTable(tableName))) {
        continue;
      }

      await this.dropManagedPolicies(queryRunner, tableName);
      await queryRunner.query(
        `ALTER TABLE ${quoteIdent(tableName)} NO FORCE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(
        `ALTER TABLE ${quoteIdent(tableName)} DISABLE ROW LEVEL SECURITY`,
      );
    }
  }

  private async enableGlobalReadSuperAdminWrite(
    queryRunner: QueryRunner,
    tableName: string,
  ): Promise<void> {
    const table = quoteIdent(tableName);
    await this.enablePolicies(queryRunner, tableName, [
      {
        name: 'rls_global_read',
        sql: `CREATE POLICY "rls_global_read" ON ${table} FOR SELECT USING (true)`,
      },
      {
        name: 'rls_super_admin_insert',
        sql: `CREATE POLICY "rls_super_admin_insert" ON ${table} FOR INSERT WITH CHECK (is_super_admin() = true)`,
      },
      {
        name: 'rls_super_admin_update',
        sql: `CREATE POLICY "rls_super_admin_update" ON ${table} FOR UPDATE USING (is_super_admin() = true) WITH CHECK (is_super_admin() = true)`,
      },
      {
        name: 'rls_super_admin_delete',
        sql: `CREATE POLICY "rls_super_admin_delete" ON ${table} FOR DELETE USING (is_super_admin() = true)`,
      },
    ]);
  }

  private async enableOperationalGlobalRuntimeAccess(
    queryRunner: QueryRunner,
    tableName: string,
  ): Promise<void> {
    const table = quoteIdent(tableName);
    await this.enablePolicies(queryRunner, tableName, [
      {
        name: 'rls_operational_global_runtime_access',
        sql: `CREATE POLICY "rls_operational_global_runtime_access" ON ${table} FOR ALL USING (true) WITH CHECK (true)`,
      },
    ]);
  }

  private async enableTenantColumnPolicy(
    queryRunner: QueryRunner,
    input: {
      tableName: string;
      tenantColumn: string;
      allowGlobalRead: boolean;
    },
  ): Promise<void> {
    const table = quoteIdent(input.tableName);
    const tenantColumn = quoteIdent(input.tenantColumn);
    const tenantMatch = `${tenantColumn}::text = current_company()::text`;
    const readExpression = input.allowGlobalRead
      ? `(${tenantColumn} IS NULL OR ${tenantMatch} OR is_super_admin() = true)`
      : `(${tenantMatch} OR is_super_admin() = true)`;
    const writeExpression = `(${tenantMatch} OR is_super_admin() = true)`;

    await this.enablePolicies(queryRunner, input.tableName, [
      {
        name: 'rls_tenant_select',
        sql: `CREATE POLICY "rls_tenant_select" ON ${table} FOR SELECT USING ${readExpression}`,
      },
      {
        name: 'rls_tenant_insert',
        sql: `CREATE POLICY "rls_tenant_insert" ON ${table} FOR INSERT WITH CHECK ${writeExpression}`,
      },
      {
        name: 'rls_tenant_update',
        sql: `CREATE POLICY "rls_tenant_update" ON ${table} FOR UPDATE USING ${writeExpression} WITH CHECK ${writeExpression}`,
      },
      {
        name: 'rls_tenant_delete',
        sql: `CREATE POLICY "rls_tenant_delete" ON ${table} FOR DELETE USING ${writeExpression}`,
      },
    ]);
  }

  private async enableParentTenantPolicy(
    queryRunner: QueryRunner,
    input: {
      tableName: string;
      parentTable: string;
      parentColumn: string;
      childColumn: string;
      parentTenantColumn: string;
      allowGlobalParentRead: boolean;
    },
  ): Promise<void> {
    const table = quoteIdent(input.tableName);
    const parent = quoteIdent(input.parentTable);
    const parentColumn = quoteIdent(input.parentColumn);
    const childColumn = quoteIdent(input.childColumn);
    const parentTenantColumn = quoteIdent(input.parentTenantColumn);
    const parentTenantMatch = `p.${parentTenantColumn}::text = current_company()::text`;
    const parentReadScope = input.allowGlobalParentRead
      ? `(p.${parentTenantColumn} IS NULL OR ${parentTenantMatch} OR is_super_admin() = true)`
      : `(${parentTenantMatch} OR is_super_admin() = true)`;
    const parentWriteScope = `(${parentTenantMatch} OR is_super_admin() = true)`;
    const readExpression = `(
      EXISTS (
        SELECT 1
        FROM ${parent} p
        WHERE p.${parentColumn} = ${table}.${childColumn}
          AND ${parentReadScope}
      )
    )`;
    const writeExpression = `(
      EXISTS (
        SELECT 1
        FROM ${parent} p
        WHERE p.${parentColumn} = ${table}.${childColumn}
          AND ${parentWriteScope}
      )
    )`;

    await this.enablePolicies(queryRunner, input.tableName, [
      {
        name: 'rls_parent_tenant_select',
        sql: `CREATE POLICY "rls_parent_tenant_select" ON ${table} FOR SELECT USING ${readExpression}`,
      },
      {
        name: 'rls_parent_tenant_insert',
        sql: `CREATE POLICY "rls_parent_tenant_insert" ON ${table} FOR INSERT WITH CHECK ${writeExpression}`,
      },
      {
        name: 'rls_parent_tenant_update',
        sql: `CREATE POLICY "rls_parent_tenant_update" ON ${table} FOR UPDATE USING ${writeExpression} WITH CHECK ${writeExpression}`,
      },
      {
        name: 'rls_parent_tenant_delete',
        sql: `CREATE POLICY "rls_parent_tenant_delete" ON ${table} FOR DELETE USING ${writeExpression}`,
      },
    ]);
  }

  private async enablePolicies(
    queryRunner: QueryRunner,
    tableName: string,
    policies: Policy[],
  ): Promise<void> {
    if (!(await queryRunner.hasTable(tableName))) {
      return;
    }

    await queryRunner.query(
      `ALTER TABLE ${quoteIdent(tableName)} ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE ${quoteIdent(tableName)} FORCE ROW LEVEL SECURITY`,
    );
    await this.dropManagedPolicies(queryRunner, tableName);

    for (const policy of policies) {
      await queryRunner.query(policy.sql);
    }
  }

  private async dropManagedPolicies(
    queryRunner: QueryRunner,
    tableName: string,
  ): Promise<void> {
    const table = quoteIdent(tableName);
    const policyNames = [
      'rls_global_read',
      'rls_super_admin_insert',
      'rls_super_admin_update',
      'rls_super_admin_delete',
      'rls_operational_global_runtime_access',
      'rls_tenant_select',
      'rls_tenant_insert',
      'rls_tenant_update',
      'rls_tenant_delete',
      'rls_parent_tenant_select',
      'rls_parent_tenant_insert',
      'rls_parent_tenant_update',
      'rls_parent_tenant_delete',
    ];

    for (const policyName of policyNames) {
      await queryRunner.query(
        `DROP POLICY IF EXISTS ${quoteIdent(policyName)} ON ${table}`,
      );
    }
  }
}
