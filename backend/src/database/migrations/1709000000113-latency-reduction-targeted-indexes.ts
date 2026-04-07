import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Redução de Latência — Índices Cirúrgicos para Queries Quentes
 *
 * Análise de hot paths identificou os seguintes gaps (não cobertos por migrations anteriores):
 *
 * 1. sites.nome gin_trgm
 *    → DDS e APR fazem busca textual em site.nome via ILIKE. Migration 082 adicionou
 *      GIN apenas em users e companies. Sites ficaram de fora.
 *    → Impacto: cada busca por site faz scan sequencial da tabela sites.
 *
 * 2. nonconformities.codigo_nc gin_trgm
 *    → NC list faz LOWER(nc.codigo_nc) LIKE para busca, sem índice trigram.
 *
 * 3. trainings(company_id, data_vencimento) WHERE deleted_at IS NULL
 *    → Expiry summary executa 3 COUNT queries com range em data_vencimento.
 *      Migration 087 tem (company_id, status, due_date) mas não filtrado por deleted_at.
 *
 * 4. rdos(company_id, data DESC) WHERE deleted_at IS NULL
 *    → Paginação ordena por data; migration 109 só tem (company_id) sem data.
 *
 * 5. nonconformities(company_id, codigo_nc) WHERE deleted_at IS NULL
 *    → Lookup de NC por código único dentro do tenant.
 *
 * 6. JSONB GIN em aprs.itens_risco
 *    → Após migration 110 (text→jsonb), o planner pode usar GIN para @> queries
 *      de risk item lookup. Habilita: WHERE itens_risco @> '[{"status":"pendente"}]'.
 *
 * 7. JSONB GIN em ai_interactions.response
 *    → Queries de auditoria filtram por response.type, response.model_used, etc.
 *
 * 8. apr_risk_items(apr_id, nivel_risco) WHERE nivel_risco IS NOT NULL
 *    → Risk aggregation (score, dashboard) faz GROUP BY apr_id + filter por nivel_risco.
 *
 * 9. service_orders(company_id, status, data_emissao DESC) WHERE deleted_at IS NULL
 *    → Lista paginada de OS sem índice composto.
 *
 * 10. inspections(company_id, data_inspecao DESC) WHERE deleted_at IS NULL
 *     → Lista paginada de inspeções sem índice na data de inspeção.
 *
 * 11. contracts(company_id, status, end_date) WHERE deleted_at IS NULL
 *     → Dashboard de contratos filtros por status + vencimento.
 *
 * transaction = false: CREATE INDEX CONCURRENTLY não pode rodar em transação.
 */
export class LatencyReductionTargetedIndexes1709000000113
  implements MigrationInterface
{
  name = 'LatencyReductionTargetedIndexes1709000000113';

  transaction = false;

  private async idx(queryRunner: QueryRunner, sql: string): Promise<void> {
    try {
      await queryRunner.query(sql);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // Ignorar erros de permissão em ambientes gerenciados (Supabase, Railway)
      if (
        msg.includes('already exists') ||
        msg.includes('must be owner') ||
        msg.includes('permission denied')
      ) {
        return;
      }
      console.warn(`[113] Index creation warning: ${msg}`);
    }
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Garantir pg_trgm (idempotente)
    await this.idx(
      queryRunner,
      `DO $$ BEGIN CREATE EXTENSION IF NOT EXISTS pg_trgm; EXCEPTION WHEN OTHERS THEN NULL; END $$`,
    );

    // =========================================================
    // 1. sites.nome — GIN trigram para busca textual em DDS/APR
    // =========================================================
    await this.idx(
      queryRunner,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_sites_nome_trgm"
       ON "sites" USING gin ("nome" gin_trgm_ops)`,
    );

    // 2. sites(company_id, nome) — filtered para lookup por tenant
    await this.idx(
      queryRunner,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_sites_company_nome"
       ON "sites" ("company_id", "nome")
       WHERE "deleted_at" IS NULL`,
    );

    // =========================================================
    // 3. nonconformities.codigo_nc — GIN trigram para busca NC
    // =========================================================
    await this.idx(
      queryRunner,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_nonconformities_codigo_nc_trgm"
       ON "nonconformities" USING gin ("codigo_nc" gin_trgm_ops)`,
    );

    // =========================================================
    // 4. trainings — expiry range queries
    // =========================================================
    await this.idx(
      queryRunner,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_trainings_company_vencimento"
       ON "trainings" ("company_id", "data_vencimento")
       WHERE "deleted_at" IS NULL`,
    );

    // Lookup de treinamento por user+vencimento (alertas individuais)
    await this.idx(
      queryRunner,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_trainings_user_vencimento"
       ON "trainings" ("user_id", "data_vencimento")
       WHERE "deleted_at" IS NULL`,
    );

    // =========================================================
    // 5. rdos — paginação por data
    // =========================================================
    await this.idx(
      queryRunner,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_rdos_company_data_active"
       ON "rdos" ("company_id", "data" DESC)
       WHERE "deleted_at" IS NULL`,
    );

    // RDO lookup por número (geração de próximo número)
    await this.idx(
      queryRunner,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_rdos_company_numero"
       ON "rdos" ("company_id", "numero")
       WHERE "deleted_at" IS NULL`,
    );

    // =========================================================
    // 6. JSONB GIN — aprs.itens_risco (risk @> containment)
    // =========================================================
    await this.idx(
      queryRunner,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_aprs_itens_risco_gin"
       ON "aprs" USING gin ("itens_risco")
       WHERE "itens_risco" IS NOT NULL AND "deleted_at" IS NULL`,
    );

    // classificacao_resumo (dashboard risk summary)
    await this.idx(
      queryRunner,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_aprs_classificacao_resumo_gin"
       ON "aprs" USING gin ("classificacao_resumo")
       WHERE "classificacao_resumo" IS NOT NULL AND "deleted_at" IS NULL`,
    );

    // =========================================================
    // 7. JSONB GIN — ai_interactions.response (audit queries)
    // =========================================================
    await this.idx(
      queryRunner,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_ai_interactions_response_gin"
       ON "ai_interactions" USING gin ("response")
       WHERE "response" IS NOT NULL`,
    );

    // =========================================================
    // 8. apr_risk_items — aggregation indexes
    // =========================================================
    await this.idx(
      queryRunner,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_apr_risk_items_apr_nivel"
       ON "apr_risk_items" ("apr_id", "nivel_risco")
       WHERE "nivel_risco" IS NOT NULL`,
    );

    await this.idx(
      queryRunner,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_apr_risk_items_company_score"
       ON "apr_risk_items" ("score_risco")
       WHERE "score_risco" IS NOT NULL`,
    );

    // =========================================================
    // 9. service_orders — paginação paginada
    // =========================================================
    await this.idx(
      queryRunner,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_service_orders_company_status_data"
       ON "service_orders" ("company_id", "status", "data_emissao" DESC)
       WHERE "deleted_at" IS NULL`,
    );

    // =========================================================
    // 10. inspections — paginação por data
    // =========================================================
    await this.idx(
      queryRunner,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_inspections_company_data_inspecao"
       ON "inspections" ("company_id", "data_inspecao" DESC)
       WHERE "deleted_at" IS NULL`,
    );

    // =========================================================
    // 11. contracts — dashboard (status + vencimento)
    // =========================================================
    await this.idx(
      queryRunner,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_contracts_company_status_end"
       ON "contracts" ("company_id", "status", "end_date")
       WHERE "deleted_at" IS NULL`,
    );

    // =========================================================
    // 12. Covering indexes — evitar heap fetch em listagens
    //     INCLUDE permite retornar colunas extras sem voltar à heap
    // =========================================================

    // DDS list: id+data+tema suficiente para card sem INCLUDE nas relações
    await this.idx(
      queryRunner,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_dds_company_created_cover"
       ON "dds" ("company_id", "created_at" DESC)
       INCLUDE ("status", "tema", "site_id", "facilitador_id")
       WHERE "deleted_at" IS NULL`,
    );

    // APR list covering: evita heap para exibição do card
    await this.idx(
      queryRunner,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_aprs_company_cover_list"
       ON "aprs" ("company_id", "created_at" DESC)
       INCLUDE ("status", "numero", "site_id", "elaborador_id", "tipo_servico")
       WHERE "deleted_at" IS NULL`,
    );

    // PT list covering
    await this.idx(
      queryRunner,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_pts_company_cover_list"
       ON "pts" ("company_id", "created_at" DESC)
       INCLUDE ("status", "numero", "site_id", "responsavel_id", "data_hora_inicio")
       WHERE "deleted_at" IS NULL`,
    );

    // =========================================================
    // 13. mail_logs — alertas e auditoria de entregas
    // =========================================================
    await this.idx(
      queryRunner,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_mail_logs_company_created"
       ON "mail_logs" ("company_id", "created_at" DESC)`,
    );

    await this.idx(
      queryRunner,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_mail_logs_status_created"
       ON "mail_logs" ("status", "created_at" DESC)
       WHERE "company_id" IS NOT NULL`,
    );

    // =========================================================
    // 14. audit_logs — forensic lookup por entity+action
    // =========================================================
    await this.idx(
      queryRunner,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_audit_logs_entity_action"
       ON "audit_logs" ("entity", "action", "timestamp" DESC)`,
    );

    await this.idx(
      queryRunner,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_audit_logs_user_timestamp"
       ON "audit_logs" ("userId", "timestamp" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const drops = [
      'idx_sites_nome_trgm',
      'idx_sites_company_nome',
      'idx_nonconformities_codigo_nc_trgm',
      'idx_trainings_company_vencimento',
      'idx_trainings_user_vencimento',
      'idx_rdos_company_data_active',
      'idx_rdos_company_numero',
      'idx_aprs_itens_risco_gin',
      'idx_aprs_classificacao_resumo_gin',
      'idx_ai_interactions_response_gin',
      'idx_apr_risk_items_apr_nivel',
      'idx_apr_risk_items_company_score',
      'idx_service_orders_company_status_data',
      'idx_inspections_company_data_inspecao',
      'idx_contracts_company_status_end',
      'idx_dds_company_created_cover',
      'idx_aprs_company_cover_list',
      'idx_pts_company_cover_list',
      'idx_mail_logs_company_created',
      'idx_mail_logs_status_created',
      'idx_audit_logs_entity_action',
      'idx_audit_logs_user_timestamp',
    ];

    for (const name of drops) {
      await this.idx(
        queryRunner,
        `DROP INDEX CONCURRENTLY IF EXISTS "${name}"`,
      );
    }
  }
}
