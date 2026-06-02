import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDocumentVideoAttachments1709000000061 implements MigrationInterface {
  name = 'CreateDocumentVideoAttachments1709000000061';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "document_video_attachments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "company_id" character varying(120) NOT NULL,
        "module" character varying(50) NOT NULL,
        "document_type" character varying(50) NOT NULL,
        "document_id" character varying(120) NOT NULL,
        "original_name" text NOT NULL,
        "mime_type" character varying(120) NOT NULL,
        "size_bytes" integer NOT NULL,
        "file_hash" character varying(64) NOT NULL,
        "storage_key" text NOT NULL,
        "uploaded_by_id" character varying(120),
        "uploaded_at" TIMESTAMP NOT NULL,
        "duration_seconds" integer,
        "processing_status" character varying(32) NOT NULL DEFAULT 'ready',
        "availability" character varying(64) NOT NULL DEFAULT 'stored',
        "removed_at" TIMESTAMP,
        "removed_by_id" character varying(120),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_document_video_attachments_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_document_video_company_module_document_created"
      ON "document_video_attachments" ("company_id", "module", "document_id", "created_at")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_document_video_company_module_document_removed"
      ON "document_video_attachments" ("company_id", "module", "document_id", "removed_at")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_document_video_storage_key"
      ON "document_video_attachments" ("storage_key")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_document_video_storage_key"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_document_video_company_module_document_removed"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_document_video_company_module_document_created"
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS "document_video_attachments"
    `);
  }
}
