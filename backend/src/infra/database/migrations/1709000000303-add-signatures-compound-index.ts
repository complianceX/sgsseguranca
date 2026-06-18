import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSignaturesCompoundIndex1709000000303 implements MigrationInterface {
  name = 'AddSignaturesCompoundIndex1709000000303';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('signatures'))) {
      return;
    }

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_signatures_doctype_docid_company"
      ON "signatures" ("document_type", "document_id", "company_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_signatures_doctype_docid_company"`,
    );
  }
}
