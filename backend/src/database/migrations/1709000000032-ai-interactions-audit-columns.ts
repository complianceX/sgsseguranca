import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adiciona colunas de auditoria avançada à tabela `ai_interactions`.
 *
 * Novas colunas:
 * - model, provider — rastreabilidade do provedor e modelo usado
 * - latency_ms — monitoramento de SLA e performance
 * - token_usage_input, token_usage_output — granularidade de tokens por tipo
 * - estimated_cost_usd — controle de custos por interação
 * - confidence — nível de confiança da resposta
 * - needs_human_review — flag de segurança
 * - human_review_reasons — razões rastreáveis (JSON)
 * - human_review_reason — descrição textual
 */
export class AiInteractionsAuditColumns1709000000032 implements MigrationInterface {
  name = 'AiInteractionsAuditColumns1709000000032';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Auditoria de provedor e modelo
    await queryRunner.query(`ALTER TABLE "ai_interactions" ADD COLUMN IF NOT EXISTS "model" varchar`);
    await queryRunner.query(`ALTER TABLE "ai_interactions" ADD COLUMN IF NOT EXISTS "provider" varchar`);
    await queryRunner.query(`ALTER TABLE "ai_interactions" ADD COLUMN IF NOT EXISTS "latency_ms" integer`);

    // Tokens granulares (além do tokens_used já existente)
    await queryRunner.query(`ALTER TABLE "ai_interactions" ADD COLUMN IF NOT EXISTS "token_usage_input" integer`);
    await queryRunner.query(`ALTER TABLE "ai_interactions" ADD COLUMN IF NOT EXISTS "token_usage_output" integer`);
    await queryRunner.query(`ALTER TABLE "ai_interactions" ADD COLUMN IF NOT EXISTS "estimated_cost_usd" decimal(12,8)`);

    // Qualidade e segurança
    await queryRunner.query(`ALTER TABLE "ai_interactions" ADD COLUMN IF NOT EXISTS "confidence" varchar`);
    await queryRunner.query(`ALTER TABLE "ai_interactions" ADD COLUMN IF NOT EXISTS "needs_human_review" boolean`);
    await queryRunner.query(`ALTER TABLE "ai_interactions" ADD COLUMN IF NOT EXISTS "human_review_reasons" json`);
    await queryRunner.query(`ALTER TABLE "ai_interactions" ADD COLUMN IF NOT EXISTS "human_review_reason" text`);

    // Índice para queries de auditoria (ex: filtrar por needs_human_review)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ai_interactions_tenant_review"
      ON "ai_interactions" ("tenant_id", "needs_human_review")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ai_interactions_tenant_review"`);
    await queryRunner.query(`ALTER TABLE "ai_interactions" DROP COLUMN IF EXISTS "human_review_reason"`);
    await queryRunner.query(`ALTER TABLE "ai_interactions" DROP COLUMN IF EXISTS "human_review_reasons"`);
    await queryRunner.query(`ALTER TABLE "ai_interactions" DROP COLUMN IF EXISTS "needs_human_review"`);
    await queryRunner.query(`ALTER TABLE "ai_interactions" DROP COLUMN IF EXISTS "confidence"`);
    await queryRunner.query(`ALTER TABLE "ai_interactions" DROP COLUMN IF EXISTS "estimated_cost_usd"`);
    await queryRunner.query(`ALTER TABLE "ai_interactions" DROP COLUMN IF EXISTS "token_usage_output"`);
    await queryRunner.query(`ALTER TABLE "ai_interactions" DROP COLUMN IF EXISTS "token_usage_input"`);
    await queryRunner.query(`ALTER TABLE "ai_interactions" DROP COLUMN IF EXISTS "latency_ms"`);
    await queryRunner.query(`ALTER TABLE "ai_interactions" DROP COLUMN IF EXISTS "provider"`);
    await queryRunner.query(`ALTER TABLE "ai_interactions" DROP COLUMN IF EXISTS "model"`);
  }
}
