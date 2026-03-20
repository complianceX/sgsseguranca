import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUniqueDocumentCodeByModule1709000000054 implements MigrationInterface {
  name = 'AddUniqueDocumentCodeByModule1709000000054';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM "document_registry"
          WHERE "document_code" IS NOT NULL
          GROUP BY "module", UPPER("document_code")
          HAVING COUNT(*) > 1
        ) THEN
          RAISE EXCEPTION 'Existem codigos documentais duplicados por modulo no document_registry. Corrija os dados antes de aplicar a constraint de unicidade.';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_document_registry_module_document_code_ci"
      ON "document_registry" ("module", UPPER("document_code"))
      WHERE "document_code" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_document_registry_module_document_code_ci"
    `);
  }
}
