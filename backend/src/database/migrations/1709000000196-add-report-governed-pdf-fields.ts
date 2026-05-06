import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReportGovernedPdfFields1709000000196 implements MigrationInterface {
  name = 'AddReportGovernedPdfFields1709000000196';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "reports"
      ADD COLUMN IF NOT EXISTS "pdf_file_key" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "reports"
      ADD COLUMN IF NOT EXISTS "pdf_folder_path" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "reports"
      ADD COLUMN IF NOT EXISTS "pdf_original_name" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "reports"
      ADD COLUMN IF NOT EXISTS "pdf_file_hash" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "reports"
      ADD COLUMN IF NOT EXISTS "pdf_generated_at" TIMESTAMP
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "reports"
      DROP COLUMN IF EXISTS "pdf_generated_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "reports"
      DROP COLUMN IF EXISTS "pdf_file_hash"
    `);
    await queryRunner.query(`
      ALTER TABLE "reports"
      DROP COLUMN IF EXISTS "pdf_original_name"
    `);
    await queryRunner.query(`
      ALTER TABLE "reports"
      DROP COLUMN IF EXISTS "pdf_folder_path"
    `);
    await queryRunner.query(`
      ALTER TABLE "reports"
      DROP COLUMN IF EXISTS "pdf_file_key"
    `);
  }
}
