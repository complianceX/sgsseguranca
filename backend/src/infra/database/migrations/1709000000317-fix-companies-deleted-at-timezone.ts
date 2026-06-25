import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixCompaniesDeletedAtTimezone1709000000317 implements MigrationInterface {
  name = 'FixCompaniesDeletedAtTimezone1709000000317';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "companies" ALTER COLUMN "deleted_at" TYPE TIMESTAMPTZ`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "companies" ALTER COLUMN "deleted_at" TYPE TIMESTAMP`,
    );
  }
}
