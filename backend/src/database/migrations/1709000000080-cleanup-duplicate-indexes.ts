import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Remove índices redundantes criados por migrations antigas com nomes `idx_*`.
 *
 * Mantemos os equivalentes canônicos (`IDX_*`) e os índices únicos de
 * constraints (`users_cpf_key`, `companies_cnpj_key`) para reduzir overhead
 * de escrita sem alterar comportamento funcional.
 */
export class CleanupDuplicateIndexes1709000000080 implements MigrationInterface {
  name = 'CleanupDuplicateIndexes1709000000080';

  // DROP/CREATE INDEX CONCURRENTLY não pode rodar dentro de transação.
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    const redundantIndexes = [
      'idx_aprs_company_created',
      'idx_cats_company_created',
      'idx_cats_company_status',
      'idx_dds_company_created',
      'idx_epi_assignments_company_created',
      'idx_epi_assignments_company_status',
      'idx_epi_assignments_company_user',
      'idx_inspections_company_created',
      'idx_pts_company_created',
      'idx_signatures_company_created',
      'idx_trainings_company_created',
      'idx_companies_cnpj',
      'idx_users_cpf',
    ];

    for (const indexName of redundantIndexes) {
      await queryRunner.query(
        `DROP INDEX CONCURRENTLY IF EXISTS "public"."${indexName}"`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_aprs_company_created"
      ON "aprs" ("company_id", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_cats_company_created"
      ON "cats" ("company_id", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_cats_company_status"
      ON "cats" ("company_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_dds_company_created"
      ON "dds" ("company_id", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_epi_assignments_company_created"
      ON "epi_assignments" ("company_id", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_epi_assignments_company_status"
      ON "epi_assignments" ("company_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_epi_assignments_company_user"
      ON "epi_assignments" ("company_id", "user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_inspections_company_created"
      ON "inspections" ("company_id", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_pts_company_created"
      ON "pts" ("company_id", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_signatures_company_created"
      ON "signatures" ("company_id", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_trainings_company_created"
      ON "trainings" ("company_id", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_companies_cnpj"
      ON "companies" ("cnpj")
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_users_cpf"
      ON "users" ("cpf")
    `);
  }
}
