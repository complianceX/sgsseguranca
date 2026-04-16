import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 3 — Depreciação formal do campo itens_risco (legado).
 *
 * O campo itens_risco (JSONB) foi o modelo original de itens de risco da APR,
 * substituído pelos registros estruturados em apr_risk_items (Fase 1).
 *
 * Esta migration:
 *   1. Adiciona comentário de depreciação no campo para comunicar a DB admins.
 *   2. Nullifica itens_risco em APRs que já possuem registros estruturados em
 *      apr_risk_items, eliminando duplicidade de dado sem perda de informação.
 *
 * APRs exclusivamente legadas (sem nenhum apr_risk_items) são preservadas
 * intactas. A remoção final da coluna é planejada para quando 100% das APRs
 * tiverem migrado (migration futura).
 *
 * Rollback: restaura itens_risco a partir de apr_risk_items (mapeamento
 * inverso incluso no método down).
 */
export class AprPhase3DeprecateLegacyItensRisco1709000000130
  implements MigrationInterface
{
  name = 'AprPhase3DeprecateLegacyItensRisco1709000000130';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Comentário de depreciação ──────────────────────────────────────
    await queryRunner.query(`
      COMMENT ON COLUMN "aprs"."itens_risco" IS
        '[DEPRECATED] Campo legado substituído por apr_risk_items (estruturado). '
        'Será removido após migração completa de todos os registros. '
        'Não use este campo em novas integrações — consulte apr_risk_items.'
    `);

    // ── 2. Nullifica itens_risco para APRs com dados estruturados ─────────
    // Preserva APRs que ainda não possuem apr_risk_items (migração gradual).
    await queryRunner.query(`
      UPDATE "aprs" a
      SET    "itens_risco" = NULL
      WHERE  "itens_risco" IS NOT NULL
        AND  EXISTS (
               SELECT 1
               FROM   "apr_risk_items" ri
               WHERE  ri."apr_id" = a."id"
                 AND  ri."deleted_at" IS NULL
             )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rollback best-effort: reconstrói itens_risco legado a partir dos dados
    // estruturados de apr_risk_items para APRs que tiveram o campo nullificado.
    await queryRunner.query(`
      UPDATE "aprs" a
      SET    "itens_risco" = (
               SELECT json_agg(
                 json_build_object(
                   'atividade',         ri.atividade,
                   'agente_ambiental',  ri.agente_ambiental,
                   'condicao_perigosa', ri.condicao_perigosa,
                   'fonte_circunstancia', ri.fonte_circunstancia,
                   'lesao',             ri.lesao,
                   'probabilidade',     ri.probabilidade::text,
                   'severidade',        ri.severidade::text,
                   'score_risco',       ri.score_risco::text,
                   'categoria_risco',   ri.categoria_risco,
                   'medidas_prevencao', ri.medidas_prevencao,
                   'responsavel',       ri.responsavel,
                   'status_acao',       ri.status_acao
                 )
                 ORDER BY ri.ordem
               )
               FROM   "apr_risk_items" ri
               WHERE  ri."apr_id" = a."id"
                 AND  ri."deleted_at" IS NULL
             )
      WHERE  "itens_risco" IS NULL
        AND  EXISTS (
               SELECT 1
               FROM   "apr_risk_items" ri
               WHERE  ri."apr_id" = a."id"
                 AND  ri."deleted_at" IS NULL
             )
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "aprs"."itens_risco" IS NULL
    `);
  }
}
