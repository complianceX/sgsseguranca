import { MigrationInterface, QueryRunner } from 'typeorm';

export class DocumentImportsHashTenantUnique1709000000055 implements MigrationInterface {
  name = 'DocumentImportsHashTenantUnique1709000000055';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('document_imports');
    if (!hasTable) {
      return;
    }

    await queryRunner.query(`
      DO $$
      DECLARE
        constraint_name text;
      BEGIN
        SELECT c.conname
        INTO constraint_name
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = 'document_imports'
          AND c.contype = 'u'
          AND pg_get_constraintdef(c.oid) ILIKE 'UNIQUE (hash)%'
        LIMIT 1;

        IF constraint_name IS NOT NULL THEN
          EXECUTE format(
            'ALTER TABLE "document_imports" DROP CONSTRAINT %I',
            constraint_name
          );
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_document_imports_empresa_hash"
      ON "document_imports" ("empresa_id", "hash")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('document_imports');
    if (!hasTable) {
      return;
    }

    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_document_imports_empresa_hash"
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM "document_imports"
          GROUP BY "hash"
          HAVING COUNT(*) > 1
        ) THEN
          RAISE EXCEPTION 'Nao e possivel restaurar unicidade global de hash: existem hashes repetidos entre empresas.';
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          WHERE t.relname = 'document_imports'
            AND c.conname = 'UQ_document_imports_hash'
        ) THEN
          ALTER TABLE "document_imports"
          ADD CONSTRAINT "UQ_document_imports_hash" UNIQUE ("hash");
        END IF;
      END $$;
    `);
  }
}
