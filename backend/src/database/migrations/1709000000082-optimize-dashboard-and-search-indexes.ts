import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Otimizações de latência para produção:
 * - Índices por (company_id, updated_at DESC) para feeds recentes do dashboard.
 * - Índices por (company_id, status) para contagens pendentes.
 * - pg_trgm + GIN para buscas textuais em users/companies.
 */
export class OptimizeDashboardAndSearchIndexes1709000000082 implements MigrationInterface {
  name = 'OptimizeDashboardAndSearchIndexes1709000000082';

  // CREATE/DROP INDEX CONCURRENTLY exige migration fora de transação.
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        CREATE EXTENSION IF NOT EXISTS pg_trgm;
      EXCEPTION
        WHEN insufficient_privilege THEN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_extension
            WHERE extname = 'pg_trgm'
          ) THEN
            RAISE;
          END IF;
      END $$;
    `);

    await this.executeBestEffort(
      queryRunner,
      `
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_aprs_company_updated_active"
      ON "aprs" ("company_id", "updated_at" DESC)
      WHERE "deleted_at" IS NULL
    `,
    );
    await this.executeBestEffort(
      queryRunner,
      `
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_pts_company_updated_active"
      ON "pts" ("company_id", "updated_at" DESC)
      WHERE "deleted_at" IS NULL
    `,
    );
    await this.executeBestEffort(
      queryRunner,
      `
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_checklists_company_updated_active"
      ON "checklists" ("company_id", "updated_at" DESC)
      WHERE "deleted_at" IS NULL
    `,
    );
    await this.executeBestEffort(
      queryRunner,
      `
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_audits_company_updated_active"
      ON "audits" ("company_id", "updated_at" DESC)
      WHERE "deleted_at" IS NULL
    `,
    );
    await this.executeBestEffort(
      queryRunner,
      `
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_nonconformities_company_updated_active"
      ON "nonconformities" ("company_id", "updated_at" DESC)
      WHERE "deleted_at" IS NULL
    `,
    );

    await this.executeBestEffort(
      queryRunner,
      `
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_pts_company_status_active"
      ON "pts" ("company_id", "status")
      WHERE "deleted_at" IS NULL
    `,
    );
    await this.executeBestEffort(
      queryRunner,
      `
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_checklists_company_status_active"
      ON "checklists" ("company_id", "status")
      WHERE "deleted_at" IS NULL
    `,
    );
    await this.executeBestEffort(
      queryRunner,
      `
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_nonconformities_company_status_active"
      ON "nonconformities" ("company_id", "status")
      WHERE "deleted_at" IS NULL
    `,
    );

    await this.executeBestEffort(
      queryRunner,
      `
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_users_nome_trgm"
      ON "users" USING gin ("nome" gin_trgm_ops)
    `,
    );
    await this.executeBestEffort(
      queryRunner,
      `
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_users_cpf_trgm"
      ON "users" USING gin ("cpf" gin_trgm_ops)
      WHERE "cpf" IS NOT NULL
    `,
    );
    await this.executeBestEffort(
      queryRunner,
      `
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_companies_razao_social_trgm"
      ON "companies" USING gin ("razao_social" gin_trgm_ops)
    `,
    );
    await this.executeBestEffort(
      queryRunner,
      `
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_companies_responsavel_trgm"
      ON "companies" USING gin ("responsavel" gin_trgm_ops)
    `,
    );
    await this.executeBestEffort(
      queryRunner,
      `
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_companies_cnpj_trgm"
      ON "companies" USING gin ("cnpj" gin_trgm_ops)
    `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.executeBestEffort(
      queryRunner,
      `
      DROP INDEX CONCURRENTLY IF EXISTS "idx_companies_cnpj_trgm"
    `,
    );
    await this.executeBestEffort(
      queryRunner,
      `
      DROP INDEX CONCURRENTLY IF EXISTS "idx_companies_responsavel_trgm"
    `,
    );
    await this.executeBestEffort(
      queryRunner,
      `
      DROP INDEX CONCURRENTLY IF EXISTS "idx_companies_razao_social_trgm"
    `,
    );
    await this.executeBestEffort(
      queryRunner,
      `
      DROP INDEX CONCURRENTLY IF EXISTS "idx_users_cpf_trgm"
    `,
    );
    await this.executeBestEffort(
      queryRunner,
      `
      DROP INDEX CONCURRENTLY IF EXISTS "idx_users_nome_trgm"
    `,
    );

    await this.executeBestEffort(
      queryRunner,
      `
      DROP INDEX CONCURRENTLY IF EXISTS "idx_nonconformities_company_status_active"
    `,
    );
    await this.executeBestEffort(
      queryRunner,
      `
      DROP INDEX CONCURRENTLY IF EXISTS "idx_checklists_company_status_active"
    `,
    );
    await this.executeBestEffort(
      queryRunner,
      `
      DROP INDEX CONCURRENTLY IF EXISTS "idx_pts_company_status_active"
    `,
    );

    await this.executeBestEffort(
      queryRunner,
      `
      DROP INDEX CONCURRENTLY IF EXISTS "idx_nonconformities_company_updated_active"
    `,
    );
    await this.executeBestEffort(
      queryRunner,
      `
      DROP INDEX CONCURRENTLY IF EXISTS "idx_audits_company_updated_active"
    `,
    );
    await this.executeBestEffort(
      queryRunner,
      `
      DROP INDEX CONCURRENTLY IF EXISTS "idx_checklists_company_updated_active"
    `,
    );
    await this.executeBestEffort(
      queryRunner,
      `
      DROP INDEX CONCURRENTLY IF EXISTS "idx_pts_company_updated_active"
    `,
    );
    await this.executeBestEffort(
      queryRunner,
      `
      DROP INDEX CONCURRENTLY IF EXISTS "idx_aprs_company_updated_active"
    `,
    );
  }

  private async executeBestEffort(
    queryRunner: QueryRunner,
    sql: string,
  ): Promise<void> {
    try {
      await queryRunner.query(sql);
    } catch (error) {
      if (this.isOwnershipError(error)) {
        return;
      }
      throw error;
    }
  }

  private isOwnershipError(error: unknown): boolean {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : '';
    return (
      /must be owner of table/i.test(message) ||
      /must be owner of relation/i.test(message) ||
      /must be owner of index/i.test(message)
    );
  }
}
