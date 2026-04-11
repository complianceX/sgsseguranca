import { MigrationInterface, QueryRunner } from 'typeorm';

type ColumnTypeRow = {
  data_type?: string;
};

/**
 * Upgrade: json / simple-json → jsonb em todas as tabelas operacionais
 *
 * Motivação:
 * - TypeORM `simple-json` mapeia para PostgreSQL TEXT (não json nativo).
 * - TypeORM `json` mapeia para PostgreSQL JSON (sem indexação GIN, sem operadores @>).
 * - JSONB oferece: GIN indexing, @> containment queries, compressão, deduplicação de chaves.
 *
 * Tabelas afetadas:
 *   aprs                → itens_risco, classificacao_resumo           (text → jsonb)
 *   apr_logs            → metadata                                    (text → jsonb)
 *   apr_risk_evidences  → integrity_flags                             (text → jsonb)
 *   audit_logs          → changes, before, after                      (text → jsonb)
 *   audits              → 9 colunas json                              (json → jsonb)
 *   nonconformities     → classificacao, risco_consequencias, causa,
 *                         anexos                                       (text → jsonb)
 *   ai_interactions     → response, tools_called, human_review_reasons (json → jsonb)
 *   inspections         → metodologia, perigos_riscos, plano_acao,
 *                         evidencias                                   (json → jsonb)
 *   service_orders      → riscos_identificados, epis_necessarios       (json → jsonb)
 *
 * NOTA: ALTER COLUMN TYPE não quebra a API do TypeORM. O driver PostgreSQL
 * retorna JSONB como objeto JS nativamente, igual a JSON.
 *
 * Estratégia de rollback: json e text aceitam USING col::text, então o down
 * é seguro (sem perda de dados).
 */
export class UpgradeJsonToJsonb1709000000110 implements MigrationInterface {
  name = 'UpgradeJsonToJsonb1709000000110';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // =========================================================
    // Função helper: converte coluna para jsonb se não for ainda
    // =========================================================
    const toJsonb = async (
      table: string,
      column: string,
      _fromType: 'text' | 'json' = 'text',
    ) => {
      const tableExists = await queryRunner.hasTable(table);
      if (!tableExists) return;

      const colType = (await queryRunner.query(
        `
        SELECT data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = $1
          AND column_name  = $2
        `,
        [table, column],
      )) as ColumnTypeRow[];

      if (colType.length === 0) return; // coluna não existe
      if (colType[0].data_type === 'jsonb') return; // já migrada

      // text → jsonb precisa de USING col::jsonb
      // json  → jsonb pode usar USING col::jsonb
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE jsonb USING "${column}"::jsonb`,
      );
    };

    // =========================================================
    // aprs
    // =========================================================
    await toJsonb('aprs', 'itens_risco', 'text');
    await toJsonb('aprs', 'classificacao_resumo', 'text');

    // =========================================================
    // apr_logs
    // =========================================================
    await toJsonb('apr_logs', 'metadata', 'text');

    // =========================================================
    // apr_risk_evidences
    // =========================================================
    await toJsonb('apr_risk_evidences', 'integrity_flags', 'text');

    // =========================================================
    // audit_logs (camelCase column names in PG due to TypeORM)
    // =========================================================
    await toJsonb('audit_logs', 'changes', 'text');
    await toJsonb('audit_logs', 'before', 'text');
    await toJsonb('audit_logs', 'after', 'text');

    // =========================================================
    // audits (9 colunas json)
    // =========================================================
    await toJsonb('audits', 'referencias', 'json');
    await toJsonb('audits', 'caracterizacao', 'json');
    await toJsonb('audits', 'documentos_avaliados', 'json');
    await toJsonb('audits', 'resultados_conformidades', 'json');
    await toJsonb('audits', 'resultados_nao_conformidades', 'json');
    await toJsonb('audits', 'resultados_observacoes', 'json');
    await toJsonb('audits', 'resultados_oportunidades', 'json');
    await toJsonb('audits', 'avaliacao_riscos', 'json');
    await toJsonb('audits', 'plano_acao', 'json');

    // =========================================================
    // nonconformities (4 colunas simple-json → text)
    // =========================================================
    await toJsonb('nonconformities', 'classificacao', 'text');
    await toJsonb('nonconformities', 'risco_consequencias', 'text');
    await toJsonb('nonconformities', 'causa', 'text');
    await toJsonb('nonconformities', 'anexos', 'text');

    // =========================================================
    // ai_interactions (3 colunas json)
    // =========================================================
    await toJsonb('ai_interactions', 'response', 'json');
    await toJsonb('ai_interactions', 'tools_called', 'json');
    await toJsonb('ai_interactions', 'human_review_reasons', 'json');

    // =========================================================
    // inspections (4 colunas json)
    // =========================================================
    await toJsonb('inspections', 'metodologia', 'json');
    await toJsonb('inspections', 'perigos_riscos', 'json');
    await toJsonb('inspections', 'plano_acao', 'json');
    await toJsonb('inspections', 'evidencias', 'json');

    // =========================================================
    // service_orders (2 colunas json)
    // =========================================================
    await toJsonb('service_orders', 'riscos_identificados', 'json');
    await toJsonb('service_orders', 'epis_necessarios', 'json');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverte jsonb → json (sem perda de dados; text aceita qualquer jsonb)
    const toJson = async (table: string, column: string) => {
      if (!(await queryRunner.hasTable(table))) return;
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE json USING "${column}"::text::json`,
      );
    };
    const toText = async (table: string, column: string) => {
      if (!(await queryRunner.hasTable(table))) return;
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE text USING "${column}"::text`,
      );
    };

    // aprs
    await toText('aprs', 'itens_risco');
    await toText('aprs', 'classificacao_resumo');

    // apr_logs
    await toText('apr_logs', 'metadata');

    // apr_risk_evidences
    await toText('apr_risk_evidences', 'integrity_flags');

    // audit_logs
    await toText('audit_logs', 'changes');
    await toText('audit_logs', 'before');
    await toText('audit_logs', 'after');

    // audits
    await toJson('audits', 'referencias');
    await toJson('audits', 'caracterizacao');
    await toJson('audits', 'documentos_avaliados');
    await toJson('audits', 'resultados_conformidades');
    await toJson('audits', 'resultados_nao_conformidades');
    await toJson('audits', 'resultados_observacoes');
    await toJson('audits', 'resultados_oportunidades');
    await toJson('audits', 'avaliacao_riscos');
    await toJson('audits', 'plano_acao');

    // nonconformities
    await toText('nonconformities', 'classificacao');
    await toText('nonconformities', 'risco_consequencias');
    await toText('nonconformities', 'causa');
    await toText('nonconformities', 'anexos');

    // ai_interactions
    await toJson('ai_interactions', 'response');
    await toJson('ai_interactions', 'tools_called');
    await toJson('ai_interactions', 'human_review_reasons');

    // inspections
    await toJson('inspections', 'metodologia');
    await toJson('inspections', 'perigos_riscos');
    await toJson('inspections', 'plano_acao');
    await toJson('inspections', 'evidencias');

    // service_orders
    await toJson('service_orders', 'riscos_identificados');
    await toJson('service_orders', 'epis_necessarios');
  }
}
