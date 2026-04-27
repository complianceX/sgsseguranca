import { MigrationInterface, QueryRunner } from 'typeorm';

function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

export class EnterprisePublicGrantsNotificationsRls1709000000151 implements MigrationInterface {
  name = 'EnterprisePublicGrantsNotificationsRls1709000000151';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.enableCompanyPolicy(queryRunner, 'notifications');
    await this.enableCompanyPolicy(queryRunner, 'document_download_grants');
    await this.enableCompanyPolicy(queryRunner, 'public_validation_grants');
    await this.enableCompanyPolicy(queryRunner, 'dds_approval_records');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const tableName of [
      'dds_approval_records',
      'public_validation_grants',
      'document_download_grants',
      'notifications',
    ]) {
      await queryRunner.query(
        `DROP POLICY IF EXISTS "tenant_isolation_policy" ON ${quoteIdent(tableName)}`,
      );
      await queryRunner.query(
        `ALTER TABLE ${quoteIdent(tableName)} NO FORCE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(
        `ALTER TABLE ${quoteIdent(tableName)} DISABLE ROW LEVEL SECURITY`,
      );
    }
  }

  private async enableCompanyPolicy(
    queryRunner: QueryRunner,
    tableName: string,
  ): Promise<void> {
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
  }
}
