import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Índice parcial para acelerar agregações/contagens de APR pendente ativa por
 * empresa, usadas em métricas operacionais.
 */
export class AddAprsPendingPartialIndex1709000000081
  implements MigrationInterface
{
  name = 'AddAprsPendingPartialIndex1709000000081';

  // CREATE/DROP INDEX CONCURRENTLY exige migration fora de transação.
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_aprs_pending_active_company"
      ON "aprs" ("company_id")
      WHERE "status" = 'Pendente'
        AND "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX CONCURRENTLY IF EXISTS "idx_aprs_pending_active_company"
    `);
  }
}
