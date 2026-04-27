import { MigrationInterface, QueryRunner } from 'typeorm';

export class GrantRuntimeAccessToConsentDashboardTables1709000000155 implements MigrationInterface {
  name = 'GrantRuntimeAccessToConsentDashboardTables1709000000155';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const roleExists = await this.roleExists(queryRunner, 'sgs_app');
    if (!roleExists) {
      return;
    }

    await queryRunner.query(`GRANT USAGE ON SCHEMA public TO sgs_app`);
    await queryRunner.query(`
      GRANT SELECT ON TABLE
        "consent_versions",
        "dashboard_query_snapshots",
        "dashboard_document_availability_snapshots"
      TO sgs_app
    `);
    await queryRunner.query(`
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
        "user_consents",
        "dashboard_query_snapshots",
        "dashboard_document_availability_snapshots"
      TO sgs_app
    `);
    await queryRunner.query(`
      GRANT EXECUTE ON FUNCTION
        current_company(),
        is_super_admin(),
        update_updated_at_column()
      TO sgs_app
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Intencionalmente sem revogar: esta migration corrige privilégios runtime
    // necessários para produção e não deve quebrar rollback operacional.
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
