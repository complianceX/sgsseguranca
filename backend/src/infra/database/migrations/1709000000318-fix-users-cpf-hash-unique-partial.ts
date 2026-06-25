import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixUsersCpfHashUniquePartial1709000000318 implements MigrationInterface {
  public readonly transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "UQ_users_cpf_hash_not_null"`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "UQ_users_cpf_hash_active"
      ON "users" ("cpf_hash")
      WHERE "cpf_hash" IS NOT NULL AND "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "UQ_users_cpf_hash_active"`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "UQ_users_cpf_hash_not_null"
      ON "users" ("cpf_hash")
      WHERE "cpf_hash" IS NOT NULL
    `);
  }
}
