import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDocumentDownloadGrants1709000000125
  implements MigrationInterface
{
  name = 'CreateDocumentDownloadGrants1709000000125';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "document_download_grants" (
        "id" uuid NOT NULL,
        "company_id" uuid NOT NULL,
        "file_key" text NOT NULL,
        "original_name" text,
        "content_type" character varying(120) NOT NULL DEFAULT 'application/pdf',
        "issued_for_user_id" uuid,
        "expires_at" TIMESTAMP NOT NULL,
        "consumed_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_document_download_grants_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_document_download_grants_company_expires"
      ON "document_download_grants" ("company_id", "expires_at")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_document_download_grants_active"
      ON "document_download_grants" ("expires_at", "consumed_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_document_download_grants_active"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_document_download_grants_company_expires"
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "document_download_grants"
    `);
  }
}
