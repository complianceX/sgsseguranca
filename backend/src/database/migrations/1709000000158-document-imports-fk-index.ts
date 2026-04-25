import { MigrationInterface, QueryRunner } from 'typeorm';

export class DocumentImportsFkIndex1709000000158 implements MigrationInterface {
  name = 'DocumentImportsFkIndex1709000000158';

  // No transaction: CONCURRENTLY index requires autocommit.
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('document_imports'))) {
      return;
    }

    const constraintExists = (await queryRunner.query(
      `SELECT 1 FROM pg_constraint WHERE conname = 'FK_document_imports_empresa_id' LIMIT 1`,
    )) as Array<Record<string, unknown>>;

    if (constraintExists.length === 0) {
      // Delete orphaned rows before adding FK (empresa_id references companies that may not exist).
      await queryRunner.query(`
        DELETE FROM "document_imports"
        WHERE "empresa_id" NOT IN (SELECT "id" FROM "companies")
      `);

      await queryRunner.query(`
        ALTER TABLE "document_imports"
        ADD CONSTRAINT "FK_document_imports_empresa_id"
        FOREIGN KEY ("empresa_id") REFERENCES "companies"("id") ON DELETE CASCADE
      `);
    }

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_document_imports_empresa_id"
      ON "document_imports" ("empresa_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('document_imports'))) {
      return;
    }
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_document_imports_empresa_id"`,
    );
    await queryRunner.query(`
      ALTER TABLE "document_imports"
      DROP CONSTRAINT IF EXISTS "FK_document_imports_empresa_id"
    `);
  }
}
