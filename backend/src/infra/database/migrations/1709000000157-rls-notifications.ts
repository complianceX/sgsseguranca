import { MigrationInterface, QueryRunner } from 'typeorm';

function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

export class RlsNotifications1709000000157 implements MigrationInterface {
  name = 'RlsNotifications1709000000157';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.ensureCompanyPolicy(queryRunner, 'notifications');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('notifications')) {
      await queryRunner.query(
        `DROP POLICY IF EXISTS "rls_notifications_company_isolation" ON "notifications"`,
      );
      await queryRunner.query(
        `ALTER TABLE "notifications" DISABLE ROW LEVEL SECURITY`,
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
      `DROP POLICY IF EXISTS "rls_notifications_company_isolation" ON ${quoteIdent(tableName)}`,
    );
    await queryRunner.query(`
      CREATE POLICY "rls_notifications_company_isolation"
      ON ${quoteIdent(tableName)}
      AS RESTRICTIVE
      FOR ALL
      USING (company_id = current_company() OR is_super_admin() = true)
      WITH CHECK (company_id = current_company() OR is_super_admin() = true)
    `);

    const rows = (await queryRunner.query(
      `SELECT 1 FROM pg_roles WHERE rolname = 'sgs_app' LIMIT 1`,
    )) as Array<Record<string, unknown>>;
    if (rows.length > 0) {
      await queryRunner.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${quoteIdent(tableName)} TO sgs_app`,
      );
    }
  }
}
