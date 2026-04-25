import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Índice cobrindo para a query de listagem de APRs mais frequente:
 *   WHERE company_id = ? AND deleted_at IS NULL
 *   ORDER BY created_at DESC
 *
 * INCLUDE (titulo, numero): evita heap fetch para os campos exibidos na listagem,
 * transformando a query em index-only scan.
 *
 * transaction = false: CONCURRENTLY exige autocommit.
 */
export class AprsCoveringIndex1709000000161 implements MigrationInterface {
  name = 'AprsCoveringIndex1709000000161';

  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('aprs'))) {
      return;
    }

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_aprs_company_status_created"
      ON "aprs" ("company_id", "status", "created_at" DESC)
      INCLUDE ("titulo", "numero")
      WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_aprs_company_status_created"`,
    );
  }
}
