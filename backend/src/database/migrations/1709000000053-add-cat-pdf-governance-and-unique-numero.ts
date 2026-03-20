import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCatPdfGovernanceAndUniqueNumero1709000000053 implements MigrationInterface {
  name = 'AddCatPdfGovernanceAndUniqueNumero1709000000053';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "cats"
      ADD COLUMN IF NOT EXISTS "pdf_file_key" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "cats"
      ADD COLUMN IF NOT EXISTS "pdf_folder_path" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "cats"
      ADD COLUMN IF NOT EXISTS "pdf_original_name" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "cats"
      ADD COLUMN IF NOT EXISTS "pdf_file_hash" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "cats"
      ADD COLUMN IF NOT EXISTS "pdf_generated_at" TIMESTAMP
    `);

    await queryRunner.query(`
      UPDATE "cats"
      SET "numero" = UPPER(TRIM("numero"))
      WHERE "numero" IS NOT NULL
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM "cats"
          GROUP BY "company_id", "numero"
          HAVING COUNT(*) > 1
        ) THEN
          RAISE EXCEPTION 'Existem CATs com número duplicado na mesma empresa. Corrija os dados antes de aplicar o índice de unicidade.';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_cats_company_numero"
      ON "cats" ("company_id", "numero")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_cats_company_numero"`);
    await queryRunner.query(
      `ALTER TABLE "cats" DROP COLUMN IF EXISTS "pdf_generated_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cats" DROP COLUMN IF EXISTS "pdf_file_hash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cats" DROP COLUMN IF EXISTS "pdf_original_name"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cats" DROP COLUMN IF EXISTS "pdf_folder_path"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cats" DROP COLUMN IF EXISTS "pdf_file_key"`,
    );
  }
}
