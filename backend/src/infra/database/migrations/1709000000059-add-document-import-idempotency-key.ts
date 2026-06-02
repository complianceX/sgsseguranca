import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDocumentImportIdempotencyKey1709000000059 implements MigrationInterface {
  name = 'AddDocumentImportIdempotencyKey1709000000059';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "document_imports"
      ADD COLUMN IF NOT EXISTS "idempotency_key" character varying(128)
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_document_imports_empresa_idempotency_key"
      ON "document_imports" ("empresa_id", "idempotency_key")
      WHERE "idempotency_key" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_document_imports_empresa_idempotency_key"
    `);

    await queryRunner.query(`
      ALTER TABLE "document_imports"
      DROP COLUMN IF EXISTS "idempotency_key"
    `);
  }
}
