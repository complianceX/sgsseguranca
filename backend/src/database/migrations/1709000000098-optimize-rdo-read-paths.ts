import { MigrationInterface, QueryRunner } from 'typeorm';

export class OptimizeRdoReadPaths1709000000098
  implements MigrationInterface
{
  name = 'OptimizeRdoReadPaths1709000000098';
  public transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_rdos_company_data_created_id"
      ON "rdos" ("company_id", "data" DESC, "created_at" DESC, "id" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_rdos_company_site_created_id"
      ON "rdos" ("company_id", "site_id", "created_at" DESC, "id" DESC)
      WHERE "site_id" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_rdos_pending_pdf_status_site_updated"
      ON "rdos" ("company_id", "status", "site_id", "updated_at" DESC, "id" DESC)
      WHERE "pdf_file_key" IS NULL
        AND "status" IN ('enviado', 'aprovado')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX CONCURRENTLY IF EXISTS "idx_rdos_pending_pdf_status_site_updated"
    `);
    await queryRunner.query(`
      DROP INDEX CONCURRENTLY IF EXISTS "idx_rdos_company_site_created_id"
    `);
    await queryRunner.query(`
      DROP INDEX CONCURRENTLY IF EXISTS "idx_rdos_company_data_created_id"
    `);
  }
}
