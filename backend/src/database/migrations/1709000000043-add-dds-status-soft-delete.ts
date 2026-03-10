import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDdsStatusSoftDelete1709000000043 implements MigrationInterface {
  name = 'AddDdsStatusSoftDelete1709000000043';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "dds"
        ADD COLUMN IF NOT EXISTS "status" varchar NOT NULL DEFAULT 'rascunho',
        ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP;
    `);

    // DDSs já existentes sem PDF ficam como rascunho;
    // DDSs com PDF já salvo promovidos para publicado
    await queryRunner.query(`
      UPDATE "dds"
        SET "status" = 'publicado'
        WHERE "pdf_file_key" IS NOT NULL
          AND "deleted_at" IS NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_dds_status" ON "dds" ("status");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_dds_deleted_at" ON "dds" ("deleted_at");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_dds_deleted_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_dds_status"`);
    await queryRunner.query(`
      ALTER TABLE "dds"
        DROP COLUMN IF EXISTS "deleted_at",
        DROP COLUMN IF EXISTS "status";
    `);
  }
}
