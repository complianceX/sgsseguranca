import { MigrationInterface, QueryRunner } from 'typeorm';

function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

export class FixRuntimeRlsSessionConsentPolicies1709000000156
  implements MigrationInterface
{
  name = 'FixRuntimeRlsSessionConsentPolicies1709000000156';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.ensureCompanyPolicy(queryRunner, 'user_consents');
    await this.ensureCompanyPolicy(queryRunner, 'user_sessions');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const tableName of ['user_sessions', 'user_consents']) {
      await queryRunner.query(
        `DROP POLICY IF EXISTS "tenant_isolation_policy" ON ${quoteIdent(tableName)}`,
      );
    }
  }

  private async ensureCompanyPolicy(
    queryRunner: QueryRunner,
    tableName: string,
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
    await queryRunner.query(
      `DROP POLICY IF EXISTS "tenant_isolation_policy" ON ${quoteIdent(tableName)}`,
    );
    await queryRunner.query(`
      CREATE POLICY "tenant_isolation_policy"
      ON ${quoteIdent(tableName)}
      FOR ALL
      USING (company_id = current_company() OR is_super_admin() = true)
      WITH CHECK (company_id = current_company() OR is_super_admin() = true)
    `);

    const roleExists = await this.roleExists(queryRunner, 'sgs_app');
    if (roleExists) {
      await queryRunner.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${quoteIdent(tableName)} TO sgs_app`,
      );
    }
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
}
