import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillRdoDocumentRegistry1709000000052
  implements MigrationInterface
{
  name = 'BackfillRdoDocumentRegistry1709000000052';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "document_registry" (
        "company_id", "module", "document_type", "entity_id", "title", "document_date",
        "iso_year", "iso_week", "file_key", "folder_path", "original_name", "mime_type",
        "document_code", "created_at", "updated_at"
      )
      SELECT
        "company_id",
        'rdo',
        'pdf',
        "id",
        COALESCE(NULLIF("numero", ''), 'RDO'),
        COALESCE("data"::timestamp, "created_at"),
        EXTRACT(ISOYEAR FROM COALESCE("data"::timestamp, "created_at"))::int,
        EXTRACT(WEEK FROM COALESCE("data"::timestamp, "created_at"))::int,
        "pdf_file_key",
        "pdf_folder_path",
        "pdf_original_name",
        'application/pdf',
        'RDO-' || EXTRACT(ISOYEAR FROM COALESCE("data"::timestamp, "created_at"))::int || '-' ||
          LPAD(EXTRACT(WEEK FROM COALESCE("data"::timestamp, "created_at"))::int::text, 2, '0') || '-' ||
          UPPER(SUBSTRING("id"::text, 1, 8)),
        "created_at",
        "updated_at"
      FROM "rdos"
      WHERE "pdf_file_key" IS NOT NULL
      ON CONFLICT ("module", "entity_id", "document_type") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "document_registry"
      WHERE "module" = 'rdo'
    `);
  }
}
