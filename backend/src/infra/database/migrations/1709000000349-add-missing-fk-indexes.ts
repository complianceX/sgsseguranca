import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * FASE 3 (H3) — índices de cobertura para chaves estrangeiras.
 *
 * PROBLEMA
 *   Dezessete FKs não possuíam índice com a coluna na primeira posição. O
 *   PostgreSQL indexa automaticamente a chave referenciada (lado do pai), mas
 *   nunca a coluna referenciadora (lado do filho). Sem esse índice, toda
 *   remoção ou atualização de chave no pai obriga o banco a varrer a tabela
 *   filha inteira para validar a constraint.
 *
 * IMPACTO OBSERVADO
 *   Excluir um usuário ou uma empresa dispara sequential scan em `audit_logs`,
 *   `photographic_report_images` e demais filhas — tabelas de crescimento
 *   contínuo. O custo cresce junto com o volume e o scan mantém lock durante a
 *   verificação, aumentando contenção sob concorrência.
 *
 * CRITÉRIO
 *   Só entram colunas sem índice *leading* (primeira posição). Índices
 *   compostos que já começam pela coluna da FK atendem à verificação e foram
 *   excluídos da lista.
 *
 * SEGURANÇA
 *   Criação com CONCURRENTLY, sem bloquear escrita. Idempotente
 *   (IF NOT EXISTS). O custo é o esperado de manutenção de índice na escrita —
 *   compensado por remover varredura completa na validação de FK.
 */
export class AddMissingFkIndexes1709000000349 implements MigrationInterface {
  name = 'AddMissingFkIndexes1709000000349';
  transaction = false;

  private readonly targets: Array<{
    table: string;
    column: string;
    indexName: string;
  }> = [
    {
      table: 'arrs',
      column: 'emitted_by_user_id',
      indexName: 'IDX_fk_arrs_emitted_by_user_id',
    },
    {
      table: 'audit_logs',
      column: 'user_id',
      indexName: 'IDX_fk_audit_logs_user_id',
    },
    {
      table: 'dds_signature_invites',
      column: 'created_by_user_id',
      indexName: 'IDX_fk_dds_invites_created_by_user_id',
    },
    {
      table: 'dds_signature_invites',
      column: 'participant_user_id',
      indexName: 'IDX_fk_dds_invites_participant_user_id',
    },
    {
      table: 'dds_signature_invites',
      column: 'signed_signature_id',
      indexName: 'IDX_fk_dds_invites_signed_signature_id',
    },
    {
      table: 'document_registry_versions',
      column: 'created_by',
      indexName: 'IDX_fk_doc_registry_versions_created_by',
    },
    {
      table: 'document_registry_versions',
      column: 'supersedes_id',
      indexName: 'IDX_fk_doc_registry_versions_supersedes_id',
    },
    {
      table: 'photographic_report_days',
      column: 'company_id',
      indexName: 'IDX_fk_photo_report_days_company_id',
    },
    {
      table: 'photographic_report_exports',
      column: 'company_id',
      indexName: 'IDX_fk_photo_report_exports_company_id',
    },
    {
      table: 'photographic_report_exports',
      column: 'generated_by',
      indexName: 'IDX_fk_photo_report_exports_generated_by',
    },
    {
      table: 'photographic_report_images',
      column: 'company_id',
      indexName: 'IDX_fk_photo_report_images_company_id',
    },
    {
      table: 'photographic_report_images',
      column: 'report_day_id',
      indexName: 'IDX_fk_photo_report_images_report_day_id',
    },
    {
      table: 'photographic_reports',
      column: 'created_by',
      indexName: 'IDX_fk_photographic_reports_created_by',
    },
    {
      table: 'pts',
      column: 'encerrado_por_id',
      indexName: 'IDX_fk_pts_encerrado_por_id',
    },
    {
      table: 'pts',
      column: 'vigia_user_id',
      indexName: 'IDX_fk_pts_vigia_user_id',
    },
    {
      table: 'signatures',
      column: 'site_id',
      indexName: 'IDX_fk_signatures_site_id',
    },
    {
      table: 'tenant_onboarding_invites',
      column: 'created_user_id',
      indexName: 'IDX_fk_tenant_onboarding_invites_created_user_id',
    },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const target of this.targets) {
      if (!(await queryRunner.hasTable(target.table))) continue;
      if (!(await queryRunner.hasColumn(target.table, target.column))) continue;

      await queryRunner.query(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "${target.indexName}"
        ON "${target.table}" ("${target.column}")
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const target of this.targets) {
      await queryRunner.query(
        `DROP INDEX CONCURRENTLY IF EXISTS "${target.indexName}"`,
      );
    }
  }
}
