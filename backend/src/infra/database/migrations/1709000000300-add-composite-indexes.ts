import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds composite indexes (company_id, created_at) for tables aprs, audits, checklists, activities.
 * Improves performance of multi-tenant dashboard queries.
 * Uses CREATE INDEX CONCURRENTLY; therefore transaction = false.
 */
export class AddCompositeIndexesCompanyCreated1709000000300 implements MigrationInterface {
  name = 'AddCompositeIndexesCompanyCreated1709000000300';

  // PostgreSQL does not allow CREATE/DROP INDEX CONCURRENTLY inside a transaction.
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_aprs_company_created"
      ON "aprs" ("company_id", "created_at")
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_audits_company_created"
      ON "audits" ("company_id", "created_at")
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_checklists_company_created"
      ON "checklists" ("company_id", "created_at")
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_activities_company_created"
      ON "activities" ("company_id", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_activities_company_created"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_checklists_company_created"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_audits_company_created"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_aprs_company_created"`,
    );
  }
}
