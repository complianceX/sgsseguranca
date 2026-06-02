import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuditGovernedPdfMetadata1709000000197 implements MigrationInterface {
  name = 'AddAuditGovernedPdfMetadata1709000000197';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "audits"
      ADD COLUMN IF NOT EXISTS "pdf_file_hash" text
    `);
    await queryRunner.query(`
      ALTER TABLE "audits"
      ADD COLUMN IF NOT EXISTS "pdf_generated_at" TIMESTAMP
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "audits"
      DROP COLUMN IF EXISTS "pdf_generated_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "audits"
      DROP COLUMN IF EXISTS "pdf_file_hash"
    `);
  }
}
