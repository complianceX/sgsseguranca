import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDdsPdfColumns1709000000000 implements MigrationInterface {
  name = 'AddDdsPdfColumns1709000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "dds" ADD COLUMN IF NOT EXISTS "pdf_file_key" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "dds" ADD COLUMN IF NOT EXISTS "pdf_folder_path" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "dds" ADD COLUMN IF NOT EXISTS "pdf_original_name" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "dds" DROP COLUMN IF EXISTS "pdf_original_name"`,
    );
    await queryRunner.query(
      `ALTER TABLE "dds" DROP COLUMN IF EXISTS "pdf_folder_path"`,
    );
    await queryRunner.query(
      `ALTER TABLE "dds" DROP COLUMN IF EXISTS "pdf_file_key"`,
    );
  }
}
