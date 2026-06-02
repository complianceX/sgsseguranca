import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserModuleAccess1709000000203 implements MigrationInterface {
  name = 'AddUserModuleAccess1709000000203';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "module_access_keys" jsonb NOT NULL DEFAULT '[]'::jsonb
    `);

    await queryRunner.query(`
      UPDATE "users"
      SET "module_access_keys" = '[]'::jsonb
      WHERE "module_access_keys" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "module_access_keys"
    `);
  }
}
