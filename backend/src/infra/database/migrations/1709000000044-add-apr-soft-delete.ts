import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAprSoftDelete1709000000044 implements MigrationInterface {
  name = 'AddAprSoftDelete1709000000044';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "aprs"
        ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_aprs_deleted_at" ON "aprs" ("deleted_at");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_aprs_deleted_at"`);
    await queryRunner.query(`
      ALTER TABLE "aprs"
        DROP COLUMN IF EXISTS "deleted_at";
    `);
  }
}
