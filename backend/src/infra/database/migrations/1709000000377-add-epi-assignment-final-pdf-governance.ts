import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Metadados do documento final governado da ficha de entrega de EPI.
 * Todas as colunas são nullable para preservar fichas históricas existentes.
 */
export class AddEpiAssignmentFinalPdfGovernance1709000000377 implements MigrationInterface {
  name = 'AddEpiAssignmentFinalPdfGovernance1709000000377';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('epi_assignments');
    if (!tableExists) {
      console.warn(
        'Table epi_assignments not found, skipping final PDF governance columns',
      );
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "epi_assignments"
      ADD COLUMN IF NOT EXISTS "pdf_file_key" text,
      ADD COLUMN IF NOT EXISTS "pdf_folder_path" text,
      ADD COLUMN IF NOT EXISTS "pdf_original_name" text,
      ADD COLUMN IF NOT EXISTS "final_pdf_hash_sha256" varchar(64),
      ADD COLUMN IF NOT EXISTS "pdf_generated_at" timestamp,
      ADD COLUMN IF NOT EXISTS "document_code" varchar(100),
      ADD COLUMN IF NOT EXISTS "emitted_by_user_id" uuid
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('epi_assignments');
    if (!tableExists) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "epi_assignments"
      DROP COLUMN IF EXISTS "pdf_file_key",
      DROP COLUMN IF EXISTS "pdf_folder_path",
      DROP COLUMN IF EXISTS "pdf_original_name",
      DROP COLUMN IF EXISTS "final_pdf_hash_sha256",
      DROP COLUMN IF EXISTS "pdf_generated_at",
      DROP COLUMN IF EXISTS "document_code",
      DROP COLUMN IF EXISTS "emitted_by_user_id"
    `);
  }
}
