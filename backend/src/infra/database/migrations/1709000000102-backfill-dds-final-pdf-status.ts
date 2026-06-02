import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillDdsFinalPdfStatus1709000000102 implements MigrationInterface {
  name = 'BackfillDdsFinalPdfStatus1709000000102';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "dds"
      SET "status" = 'publicado',
          "updated_at" = NOW()
      WHERE "pdf_file_key" IS NOT NULL
        AND COALESCE("status", 'rascunho') = 'rascunho'
        AND "deleted_at" IS NULL
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No-op: não é seguro rebaixar automaticamente documentos já emitidos.
  }
}
