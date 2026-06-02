import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTrainingGovernedPdfFields1709000000195 implements MigrationInterface {
  name = 'AddTrainingGovernedPdfFields1709000000195';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "trainings"
      ADD COLUMN IF NOT EXISTS "pdf_file_key" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "trainings"
      ADD COLUMN IF NOT EXISTS "pdf_folder_path" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "trainings"
      ADD COLUMN IF NOT EXISTS "pdf_original_name" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "trainings"
      ADD COLUMN IF NOT EXISTS "pdf_file_hash" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "trainings"
      ADD COLUMN IF NOT EXISTS "pdf_generated_at" TIMESTAMP
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "trainings"
      DROP COLUMN IF EXISTS "pdf_generated_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "trainings"
      DROP COLUMN IF EXISTS "pdf_file_hash"
    `);
    await queryRunner.query(`
      ALTER TABLE "trainings"
      DROP COLUMN IF EXISTS "pdf_original_name"
    `);
    await queryRunner.query(`
      ALTER TABLE "trainings"
      DROP COLUMN IF EXISTS "pdf_folder_path"
    `);
    await queryRunner.query(`
      ALTER TABLE "trainings"
      DROP COLUMN IF EXISTS "pdf_file_key"
    `);
  }
}
