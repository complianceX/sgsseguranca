import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSoftDeleteToUsersAndCompanies1709000000014 implements MigrationInterface {
  name = 'AddSoftDeleteToUsersAndCompanies1709000000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP
    `);

    await queryRunner.query(`
      ALTER TABLE "companies"
      ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "companies"
      DROP COLUMN IF EXISTS "deleted_at"
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "deleted_at"
    `);
  }
}
