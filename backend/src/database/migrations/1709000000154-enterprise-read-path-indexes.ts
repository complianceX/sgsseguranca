import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Endurece caminhos de leitura recorrentes:
 * - warmup RBAC por sessoes ativas e fallback de usuarios recentes;
 * - calendario mensal por data operacional;
 * - fila pendente do dashboard por tenant/status/prazo.
 */
export class EnterpriseReadPathIndexes1709000000154 implements MigrationInterface {
  name = 'EnterpriseReadPathIndexes1709000000154';

  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_user_sessions_active_last_active"
      ON "user_sessions" ("last_active" DESC, "user_id")
      WHERE "is_active" = true AND "revoked_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_users_active_updated"
      ON "users" ("updated_at" DESC, "id")
      WHERE "status" = true AND "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_pts_pending_queue_due"
      ON "pts" ("company_id", "status", "data_hora_fim" ASC)
      WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_checklists_pending_queue_due"
      ON "checklists" ("company_id", "status", "is_modelo", "data" ASC)
      WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_medical_exams_company_realizacao_active"
      ON "medical_exams" ("company_id", "data_realizacao")
      WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_cats_company_ocorrencia_active"
      ON "cats" ("company_id", "data_ocorrencia")
      WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_service_orders_company_emissao_active"
      ON "service_orders" ("company_id", "data_emissao" DESC)
      WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_service_orders_company_emissao_active"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_cats_company_ocorrencia_active"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_medical_exams_company_realizacao_active"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_checklists_pending_queue_due"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_pts_pending_queue_due"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_users_active_updated"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_user_sessions_active_last_active"`,
    );
  }
}
