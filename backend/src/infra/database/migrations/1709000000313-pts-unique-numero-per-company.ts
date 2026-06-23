import { MigrationInterface, QueryRunner } from 'typeorm';

export class PtsUniqueNumeroPerCompany1709000000313 implements MigrationInterface {
  name = 'PtsUniqueNumeroPerCompany1709000000313';

  // CONCURRENTLY exige transaction = false
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isSqlite =
      queryRunner.connection.options.type === 'sqlite' ||
      queryRunner.connection.options.type === 'better-sqlite3';
    if (isSqlite) {
      return;
    }

    await queryRunner.query(`
      CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "UQ_pts_company_numero"
        ON "pts" ("company_id", "numero")
        WHERE "deleted_at" IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isSqlite =
      queryRunner.connection.options.type === 'sqlite' ||
      queryRunner.connection.options.type === 'better-sqlite3';
    if (isSqlite) {
      return;
    }
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "UQ_pts_company_numero"`,
    );
  }
}
