import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAiInteractionsHistoryIndex1709000000042
  implements MigrationInterface
{
  name = 'AddAiInteractionsHistoryIndex1709000000042';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('ai_interactions');
    if (!hasTable) return;

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_ai_interactions_tenant_user"`,
    );
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ai_interactions_tenant_user_created"
      ON "ai_interactions" ("tenant_id", "user_id", "created_at" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('ai_interactions');
    if (!hasTable) return;

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_ai_interactions_tenant_user_created"`,
    );
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ai_interactions_tenant_user"
      ON "ai_interactions" ("tenant_id", "user_id")
    `);
  }
}
