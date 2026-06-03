import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPdfColumnsToModules1709000000001 implements MigrationInterface {
  name = 'AddPdfColumnsToModules1709000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      'aprs',
      'pts',
      'checklists',
      'audits',
      'nonconformities',
      'reports',
    ];

    for (const table of tables) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "pdf_file_key" text`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "pdf_folder_path" text`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "pdf_original_name" text`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      'aprs',
      'pts',
      'checklists',
      'audits',
      'nonconformities',
      'reports',
    ];

    for (const table of tables) {
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP COLUMN IF EXISTS "pdf_original_name"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP COLUMN IF EXISTS "pdf_folder_path"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP COLUMN IF EXISTS "pdf_file_key"`,
      );
    }
  }
}
