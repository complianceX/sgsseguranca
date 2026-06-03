import { MigrationInterface, QueryRunner } from 'typeorm';

export class OptimizeNotificationsIndexes1709000000097 implements MigrationInterface {
  name = 'OptimizeNotificationsIndexes1709000000097';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.executeBestEffort(
      queryRunner,
      `
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_notifications_user_created"
        ON "notifications" ("userId", "createdAt" DESC)
      `,
    );
    await this.executeBestEffort(
      queryRunner,
      `
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_notifications_user_read"
        ON "notifications" ("userId", "read")
      `,
    );
    await this.executeBestEffort(
      queryRunner,
      `
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_notifications_user_type_title_created"
        ON "notifications" ("userId", "type", "title", "createdAt" DESC)
      `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.executeBestEffort(
      queryRunner,
      `DROP INDEX CONCURRENTLY IF EXISTS "idx_notifications_user_type_title_created"`,
    );
    await this.executeBestEffort(
      queryRunner,
      `DROP INDEX CONCURRENTLY IF EXISTS "idx_notifications_user_read"`,
    );
    await this.executeBestEffort(
      queryRunner,
      `DROP INDEX CONCURRENTLY IF EXISTS "idx_notifications_user_created"`,
    );
  }

  private async executeBestEffort(
    queryRunner: QueryRunner,
    sql: string,
  ): Promise<void> {
    try {
      await queryRunner.query(sql);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : '';
      if (
        /must be owner of table/i.test(message) ||
        /must be owner of relation/i.test(message) ||
        /must be owner of index/i.test(message)
      ) {
        return;
      }
      throw error;
    }
  }
}
