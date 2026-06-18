import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotificationsDedupIndex1709000000302 implements MigrationInterface {
  name = 'AddNotificationsDedupIndex1709000000302';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('notifications'))) {
      return;
    }

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_notifications_dedup"
      ON "notifications" ("company_id", "userId", "type", "title", "createdAt" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_notifications_dedup"`,
    );
  }
}
