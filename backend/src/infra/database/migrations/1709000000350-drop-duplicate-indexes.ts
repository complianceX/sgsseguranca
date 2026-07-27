import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * FASE 4 (M1) — remoção de índices duplicados.
 *
 * PROBLEMA
 *   Trinta e quatro índices eram cópias exatas de outro índice da mesma tabela:
 *   mesmas colunas, mesmo predicado e mesma unicidade. Surgiram de migrations
 *   diferentes que criaram o mesmo índice com grafias distintas
 *   (`IDX_activities_company_active` e `idx_activities_company_active`) ou com
 *   prefixos alternativos (`IDX_apr_epis_epi_id` e `IDX_fk_apr_epis_epi_id`).
 *
 * IMPACTO
 *   Cada INSERT/UPDATE/DELETE mantinha as duas cópias, dobrando o custo de
 *   escrita e o volume de WAL nessas tabelas, além de ocupar espaço e ampliar o
 *   trabalho do autovacuum. Nenhum ganho de leitura: o planejador usa apenas
 *   uma delas.
 *
 * CRITÉRIO DE ESCOLHA (qual permanece)
 *   Verificado individualmente antes da remoção:
 *     - o índice preservado é o declarado nas entities TypeORM quando existe
 *       declaração (`IDX_apr_company_id`, `IDX_checklist_company_id`,
 *       `IDX_user_company_id`), mantendo código e banco consistentes;
 *     - nenhum dos nomes removidos aparece em `@Index` de entity;
 *     - nenhum dos removidos sustenta constraint (PRIMARY KEY/UNIQUE) —
 *       constraints foram excluídas da seleção;
 *     - a comparação exigiu igualdade de unicidade. Isso é essencial: sem esse
 *       critério, um índice ÚNICO seria confundido com um não-único de mesmas
 *       colunas e a integridade seria perdida ao removê-lo.
 *
 *   Caso `pts`: `UQ_pts_company_numero` e `UQ_pts_company_numero_active` eram
 *   ambos únicos e parciais sobre `deleted_at IS NULL`, isto é, cópias exatas.
 *   Preservado o nome canônico; a unicidade permanece garantida.
 *
 * REVERSÃO
 *   `down()` recria cada índice a partir da definição do índice preservado,
 *   trocando apenas o nome — garantindo que o recriado seja idêntico ao
 *   removido, sem depender de definições transcritas manualmente.
 */
export class DropDuplicateIndexes1709000000350 implements MigrationInterface {
  name = 'DropDuplicateIndexes1709000000350';
  transaction = false;

  /** duplicate: índice removido. keep: cópia idêntica preservada. */
  private readonly pairs: Array<{ duplicate: string; keep: string }> = [
    {
      duplicate: 'idx_activities_company_active',
      keep: 'IDX_activities_company_active',
    },
    {
      duplicate: 'idx_activities_company_created',
      keep: 'IDX_activities_company_created',
    },
    { duplicate: 'idx_activities_company_id', keep: 'IDX_activity_company_id' },
    {
      duplicate: 'IDX_fk_apr_activities_activity_id',
      keep: 'IDX_apr_activities_activity_id',
    },
    { duplicate: 'IDX_fk_apr_epis_epi_id', keep: 'IDX_apr_epis_epi_id' },
    {
      duplicate: 'IDX_fk_apr_machines_machine_id',
      keep: 'IDX_apr_machines_machine_id',
    },
    {
      duplicate: 'IDX_fk_apr_participants_user_id',
      keep: 'IDX_apr_participants_user_id',
    },
    { duplicate: 'IDX_fk_apr_risks_risk_id', keep: 'IDX_apr_risks_risk_id' },
    { duplicate: 'IDX_fk_apr_tools_tool_id', keep: 'IDX_apr_tools_tool_id' },
    { duplicate: 'IDX_aprs_aprovado_por_id', keep: 'IDX_apr_aprovado_por_id' },
    {
      duplicate: 'IDX_fk_aprs_auditado_por_id',
      keep: 'IDX_apr_auditado_por_id',
    },
    { duplicate: 'idx_aprs_company_id', keep: 'IDX_apr_company_id' },
    { duplicate: 'idx_aprs_elaborador_id', keep: 'IDX_apr_elaborador_id' },
    { duplicate: 'IDX_aprs_parent_apr_id', keep: 'IDX_apr_parent_apr_id' },
    {
      duplicate: 'IDX_fk_aprs_reprovado_por_id',
      keep: 'IDX_apr_reprovado_por_id',
    },
    { duplicate: 'idx_aprs_site_id', keep: 'IDX_apr_site_id' },
    {
      duplicate: 'IDX_aprs_company_created_at',
      keep: 'IDX_aprs_company_active',
    },
    {
      duplicate: 'IDX_audit_logs_tenant_timestamp',
      keep: 'IDX_audit_logs_company_timestamp',
    },
    {
      duplicate: 'idx_audits_company_created',
      keep: 'IDX_audits_company_created',
    },
    {
      duplicate: 'idx_checklists_company_id',
      keep: 'IDX_checklist_company_id',
    },
    {
      duplicate: 'idx_checklists_inspetor_id',
      keep: 'IDX_checklist_inspetor_id',
    },
    { duplicate: 'idx_checklists_site_id', keep: 'IDX_checklist_site_id' },
    {
      duplicate: 'idx_checklists_company_created',
      keep: 'IDX_checklists_company_created',
    },
    { duplicate: 'idx_dds_company_data_monthly', keep: 'IDX_dds_company_data' },
    {
      duplicate: 'IDX_fk_dds_approval_records_actor_user_id',
      keep: 'IDX_dds_approval_records_actor_user_id',
    },
    { duplicate: 'idx_epis_company_active', keep: 'IDX_epis_company_active' },
    {
      duplicate: 'UQ_pts_company_numero_active',
      keep: 'UQ_pts_company_numero',
    },
    { duplicate: 'idx_risks_company_id', keep: 'IDX_risk_company_id' },
    { duplicate: 'idx_risks_company_active', keep: 'IDX_risks_company_active' },
    { duplicate: 'idx_sites_company_id', keep: 'IDX_site_company_id' },
    { duplicate: 'idx_sites_company_active', keep: 'IDX_sites_company_active' },
    { duplicate: 'idx_users_company_id', keep: 'IDX_user_company_id' },
    { duplicate: 'idx_users_profile_id', keep: 'IDX_user_profile_id' },
    { duplicate: 'idx_users_site_id', keep: 'IDX_user_site_id' },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const pair of this.pairs) {
      // Só remove se a cópia preservada realmente existir — evita ficar sem
      // nenhum dos dois caso o ambiente esteja em estado divergente.
      const keepExists = await this.indexExists(queryRunner, pair.keep);
      if (!keepExists) {
        continue;
      }

      await queryRunner.query(
        `DROP INDEX CONCURRENTLY IF EXISTS "${pair.duplicate}"`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const pair of this.pairs) {
      const dupExists = await this.indexExists(queryRunner, pair.duplicate);
      if (dupExists) {
        continue;
      }

      const rows = (await queryRunner.query(
        `SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname=$1`,
        [pair.keep],
      )) as Array<{ indexdef: string }>;

      const def = rows?.[0]?.indexdef;
      if (!def || !def.includes(`"${pair.keep}"`)) {
        continue;
      }

      // pg_indexes.indexdef não inclui CONCURRENTLY; inserimos para evitar
      // lock de tabela — transaction=false permite CONCURRENTLY fora de bloco DO.
      const concurrentDef = def
        .replace(/^CREATE INDEX /, 'CREATE INDEX CONCURRENTLY IF NOT EXISTS ')
        .replace(
          /^CREATE UNIQUE INDEX /,
          'CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ',
        )
        .replace(`"${pair.keep}"`, `"${pair.duplicate}"`);

      await queryRunner.query(concurrentDef);
    }
  }

  private async indexExists(
    queryRunner: QueryRunner,
    name: string,
  ): Promise<boolean> {
    const rows = (await queryRunner.query(
      `SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname=$1 LIMIT 1`,
      [name],
    )) as unknown[];
    return Array.isArray(rows) && rows.length > 0;
  }
}
