import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPtSoftDelete1709000000045 implements MigrationInterface {
  name = 'AddPtSoftDelete1709000000045';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pts"
        ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pts_deleted_at" ON "pts" ("deleted_at");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_pts_deleted_at"`);
    await queryRunner.query(`
      ALTER TABLE "pts"
        DROP COLUMN IF EXISTS "deleted_at";
    `);
  }
}
