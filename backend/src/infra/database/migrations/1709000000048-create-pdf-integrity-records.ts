import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePdfIntegrityRecords1709000000048 implements MigrationInterface {
  name = 'CreatePdfIntegrityRecords1709000000048';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pdf_integrity_records" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "hash" varchar(64) NOT NULL UNIQUE,
        "original_name" text NULL,
        "signed_by_user_id" uuid NULL,
        "company_id" uuid NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "FK_pdf_integrity_records_signed_by_user_id"
          FOREIGN KEY ("signed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_pdf_integrity_records_company_id"
          FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_pdf_integrity_records_company_created"
      ON "pdf_integrity_records" ("company_id", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_pdf_integrity_records_company_created"
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "pdf_integrity_records"
    `);
  }
}
