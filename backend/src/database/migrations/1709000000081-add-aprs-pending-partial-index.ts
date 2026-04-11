import { MigrationInterface, QueryRunner } from 'typeorm';

type ExistsRow = {
  exists?: boolean | 't' | 'true';
};

/**
 * Índice parcial para acelerar agregações/contagens de APR pendente ativa por
 * empresa, usadas em métricas operacionais.
 */
export class AddAprsPendingPartialIndex1709000000081 implements MigrationInterface {
  name = 'AddAprsPendingPartialIndex1709000000081';

  // CREATE/DROP INDEX CONCURRENTLY exige migration fora de transação.
  transaction = false;

  private async indexExists(queryRunner: QueryRunner): Promise<boolean> {
    const rows = (await queryRunner.query(
      `
        SELECT EXISTS (
          SELECT 1
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND indexname = 'idx_aprs_pending_active_company'
        ) AS "exists"
      `,
    )) as ExistsRow[];
    const value = rows?.[0]?.exists;
    return value === true || value === 't' || value === 'true';
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await this.indexExists(queryRunner)) {
      return;
    }

    try {
      await queryRunner.query(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_aprs_pending_active_company"
        ON "aprs" ("company_id")
        WHERE "status" = 'Pendente'
          AND "deleted_at" IS NULL
      `);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error ?? '');
      const ownershipError = /must be owner of table aprs/i.test(message);
      if (ownershipError && (await this.indexExists(queryRunner))) {
        return;
      }
      throw error;
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX CONCURRENTLY IF EXISTS "idx_aprs_pending_active_company"
    `);
  }
}
