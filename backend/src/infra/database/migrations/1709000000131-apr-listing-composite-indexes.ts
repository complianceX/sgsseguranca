import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * APR — índices compostos para a listagem operacional.
 *
 * `aprs.findPaginated` filtra por `company_id` e ordena por `created_at`,
 * `updated_at`, `data_fim` ou pela expressão de prioridade. Sem índices
 * compostos `(company_id, <coluna_ordenação>)` o Postgres faz seq scan +
 * sort em tenants com volume.
 *
 * Os índices abaixo cobrem:
 *   - listagem default ordenada por priority/created_at
 *   - sort 'updated-desc'
 *   - sort 'deadline-asc' e filtros por janela de vencimento (today/expired/...)
 *   - filtro composto status + janela de vencimento
 *
 * Soft delete (`deleted_at IS NULL`) entra no WHERE parcial: a listagem nunca
 * traz registros excluídos, e isso mantém o índice menor e mais eficiente.
 *
 * CREATE INDEX CONCURRENTLY não pode rodar em transação.
 */
export class AprListingCompositeIndexes1709000000131 implements MigrationInterface {
  name = 'AprListingCompositeIndexes1709000000131';

  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_aprs_company_created_at"
      ON "aprs" ("company_id", "created_at" DESC)
      WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_aprs_company_updated_at"
      ON "aprs" ("company_id", "updated_at" DESC)
      WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_aprs_company_data_fim"
      ON "aprs" ("company_id", "data_fim")
      WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_aprs_company_status_data_fim"
      ON "aprs" ("company_id", "status", "data_fim")
      WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_aprs_company_site_status"
      ON "aprs" ("company_id", "site_id", "status")
      WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_aprs_company_site_status"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_aprs_company_status_data_fim"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_aprs_company_data_fim"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_aprs_company_updated_at"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_aprs_company_created_at"`,
    );
  }
}
