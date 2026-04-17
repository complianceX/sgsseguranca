import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * FASE 1 — APR Enterprise: novos campos e índices de performance
 *
 * Novos campos em `apr_risk_items`:
 *   - etapa               : etapa específica dentro da atividade
 *   - hierarquia_controle : classificação da medida (NIOSH/NOA hierarchy)
 *   - residual_probabilidade, residual_severidade, residual_score, residual_categoria
 *   - deleted_at          : soft delete para rastreabilidade forense
 *
 * Novos campos em `aprs`:
 *   - tipo_atividade  : tipo de atividade (trabalho_altura, eletrica, etc.)
 *   - frente_trabalho : frente/área dentro do site
 *   - area_risco      : zona de risco específica
 *
 * Novos índices:
 *   - apr_risk_items: apr_id, deleted_at (soft delete query)
 *   - aprs: elaborador_id, data_inicio, tipo_atividade
 *
 * CREATE INDEX CONCURRENTLY não pode rodar dentro de transação.
 */
export class AprEnterprisePhase1FieldsAndIndexes1709000000129 implements MigrationInterface {
  name = 'AprEnterprisePhase1FieldsAndIndexes1709000000129';

  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── apr_risk_items: novos campos ────────────────────────────────────────

    await queryRunner.query(`
      ALTER TABLE "apr_risk_items"
        ADD COLUMN IF NOT EXISTS "etapa"                   text,
        ADD COLUMN IF NOT EXISTS "hierarquia_controle"     character varying(30),
        ADD COLUMN IF NOT EXISTS "residual_probabilidade"  integer,
        ADD COLUMN IF NOT EXISTS "residual_severidade"     integer,
        ADD COLUMN IF NOT EXISTS "residual_score"          integer,
        ADD COLUMN IF NOT EXISTS "residual_categoria"      character varying(40),
        ADD COLUMN IF NOT EXISTS "deleted_at"              timestamp
    `);

    // Check constraint para hierarquia_controle
    await queryRunner.query(`
      ALTER TABLE "apr_risk_items"
        ADD CONSTRAINT "CHK_apr_risk_items_hierarquia_controle"
        CHECK (
          "hierarquia_controle" IS NULL OR "hierarquia_controle" IN (
            'eliminacao', 'substituicao', 'epc', 'administrativo', 'epi', 'combinado'
          )
        )
    `);

    // Check constraints para risco residual (escala 1–5 alinhada à matriz 5×5)
    await queryRunner.query(`
      ALTER TABLE "apr_risk_items"
        ADD CONSTRAINT "CHK_apr_risk_items_residual_probabilidade"
        CHECK ("residual_probabilidade" IS NULL OR ("residual_probabilidade" >= 1 AND "residual_probabilidade" <= 5))
    `);

    await queryRunner.query(`
      ALTER TABLE "apr_risk_items"
        ADD CONSTRAINT "CHK_apr_risk_items_residual_severidade"
        CHECK ("residual_severidade" IS NULL OR ("residual_severidade" >= 1 AND "residual_severidade" <= 5))
    `);

    // ── aprs: novos campos ──────────────────────────────────────────────────

    await queryRunner.query(`
      ALTER TABLE "aprs"
        ADD COLUMN IF NOT EXISTS "tipo_atividade"   character varying(60),
        ADD COLUMN IF NOT EXISTS "frente_trabalho"  character varying(120),
        ADD COLUMN IF NOT EXISTS "area_risco"       character varying(120)
    `);

    // ── Índices apr_risk_items ──────────────────────────────────────────────

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_apr_risk_items_apr_id_deleted"
      ON "apr_risk_items" ("apr_id", "deleted_at")
      WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_apr_risk_items_apr_id_ordem"
      ON "apr_risk_items" ("apr_id", "ordem")
      WHERE "deleted_at" IS NULL
    `);

    // ── Índices aprs: campos de filtro operacional ──────────────────────────

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_aprs_elaborador_company"
      ON "aprs" ("elaborador_id", "company_id")
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_aprs_data_inicio_company"
      ON "aprs" ("data_inicio", "company_id")
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_aprs_tipo_atividade_company"
      ON "aprs" ("tipo_atividade", "company_id")
      WHERE "tipo_atividade" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_aprs_pending_site"
      ON "aprs" ("site_id", "company_id", "status")
      WHERE "status" = 'Pendente' AND "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_aprs_pending_site"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_aprs_tipo_atividade_company"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_aprs_data_inicio_company"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_aprs_elaborador_company"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_apr_risk_items_apr_id_ordem"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_apr_risk_items_apr_id_deleted"`,
    );

    await queryRunner.query(`
      ALTER TABLE "aprs"
        DROP COLUMN IF EXISTS "area_risco",
        DROP COLUMN IF EXISTS "frente_trabalho",
        DROP COLUMN IF EXISTS "tipo_atividade"
    `);

    await queryRunner.query(`
      ALTER TABLE "apr_risk_items"
        DROP CONSTRAINT IF EXISTS "CHK_apr_risk_items_residual_severidade"
    `);
    await queryRunner.query(`
      ALTER TABLE "apr_risk_items"
        DROP CONSTRAINT IF EXISTS "CHK_apr_risk_items_residual_probabilidade"
    `);
    await queryRunner.query(`
      ALTER TABLE "apr_risk_items"
        DROP CONSTRAINT IF EXISTS "CHK_apr_risk_items_hierarquia_controle"
    `);

    await queryRunner.query(`
      ALTER TABLE "apr_risk_items"
        DROP COLUMN IF EXISTS "deleted_at",
        DROP COLUMN IF EXISTS "residual_categoria",
        DROP COLUMN IF EXISTS "residual_score",
        DROP COLUMN IF EXISTS "residual_severidade",
        DROP COLUMN IF EXISTS "residual_probabilidade",
        DROP COLUMN IF EXISTS "hierarquia_controle",
        DROP COLUMN IF EXISTS "etapa"
    `);
  }
}
