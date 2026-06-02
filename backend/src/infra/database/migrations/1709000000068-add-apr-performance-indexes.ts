import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Índices de performance para a tabela `aprs`.
 *
 * Contexto K6: APR create p95 = 3491ms. Diagnóstico aponta pool exhaustion sob
 * 50 APR/s. Índices reduzem tempo de varredura das queries de list/findOne que
 * ocorrem após o INSERT, aliviando a pressão no pool de conexões.
 *
 * CREATE INDEX CONCURRENTLY não pode rodar dentro de transação.
 * Por isso esta migration define transaction = false.
 */
export class AddAprPerformanceIndexes1709000000068 implements MigrationInterface {
  name = 'AddAprPerformanceIndexes1709000000068';

  // Obrigatório para CREATE/DROP INDEX CONCURRENTLY
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Índice 1: cobre queries de lista paginada por tenant + ordenação por data.
    // Substitui sequential scan quando company_id está no WHERE e ORDER BY created_at.
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_aprs_company_created"
      ON "aprs" ("company_id", "created_at" DESC)
    `);

    // Índice 2: cobre queries filtradas por status dentro de um tenant.
    // Ex.: lista de APRs pendentes/ativas por empresa.
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_aprs_status_company"
      ON "aprs" ("status", "company_id")
    `);

    // Índice 3: cobre queries filtradas por site dentro de um tenant.
    // Ex.: mapa de riscos por obra, relatórios por site.
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_aprs_site_company"
      ON "aprs" ("site_id", "company_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_aprs_site_company"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_aprs_status_company"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_aprs_company_created"`,
    );
  }
}
