import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixAiInteractionsRlsPolicy1709000000033
  implements MigrationInterface
{
  name = 'FixAiInteractionsRlsPolicy1709000000033';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('ai_interactions');
    if (!hasTable) return;

    await queryRunner.query(
      `ALTER TABLE "ai_interactions" ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_interactions" FORCE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `DROP POLICY IF EXISTS "tenant_isolation" ON "ai_interactions"`,
    );
    await queryRunner.query(
      `DROP POLICY IF EXISTS "tenant_isolation_policy" ON "ai_interactions"`,
    );

    await queryRunner.query(`
      CREATE POLICY "tenant_isolation_policy"
      ON "ai_interactions"
      USING (
        tenant_id = current_company()::text
        OR is_super_admin() = true
      )
      WITH CHECK (
        tenant_id = current_company()::text
        OR is_super_admin() = true
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('ai_interactions');
    if (!hasTable) return;

    await queryRunner.query(
      `DROP POLICY IF EXISTS "tenant_isolation_policy" ON "ai_interactions"`,
    );

    await queryRunner.query(`
      CREATE POLICY "tenant_isolation"
      ON "ai_interactions"
      USING (tenant_id = current_setting('app.tenant_id', true))
    `);
  }
}
