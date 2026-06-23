import { MigrationInterface, QueryRunner } from 'typeorm';

export class UniqueEmailPerCompany1709000000304 implements MigrationInterface {
  name = 'UniqueEmailPerCompany1709000000304';

  // CREATE/DROP INDEX CONCURRENTLY exige migration fora de transacao.
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.executeBestEffort(
      queryRunner,
      `
      CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "UQ_users_email_company_active"
      ON "users" ("email", "company_id")
      WHERE "email" IS NOT NULL AND "deleted_at" IS NULL
    `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.executeBestEffort(
      queryRunner,
      `
      DROP INDEX CONCURRENTLY IF EXISTS "UQ_users_email_company_active"
    `,
    );
  }

  private async executeBestEffort(
    queryRunner: QueryRunner,
    sql: string,
  ): Promise<void> {
    try {
      await queryRunner.query(sql);
    } catch (error) {
      if (this.isOwnershipError(error)) {
        return;
      }
      throw error;
    }
  }

  private isOwnershipError(error: unknown): boolean {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : '';
    return (
      /must be owner of table/i.test(message) ||
      /must be owner of relation/i.test(message) ||
      /must be owner of index/i.test(message)
    );
  }
}
