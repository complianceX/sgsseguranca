import { MigrationInterface, QueryRunner } from 'typeorm';

function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

export class EnterpriseMfaRls1709000000153 implements MigrationInterface {
  name = 'EnterpriseMfaRls1709000000153';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.enableCompanyPolicy(queryRunner, 'user_mfa_credentials');
    await this.enableCompanyPolicy(queryRunner, 'user_mfa_recovery_codes');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const tableName of [
      'user_mfa_recovery_codes',
      'user_mfa_credentials',
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
