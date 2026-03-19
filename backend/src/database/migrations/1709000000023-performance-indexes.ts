import { MigrationInterface, QueryRunner } from 'typeorm';

type InformationSchemaTableRow = {
  table_name: string;
};

function isInformationSchemaTableRow(
  value: unknown,
): value is InformationSchemaTableRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    'table_name' in value &&
    typeof (value as { table_name?: unknown }).table_name === 'string'
  );
}

/**
 * Índices de performance para escala multi-tenant.
 *
 * ESTRATÉGIA:
 *  - FASE 1: índice company_id dinâmico em TODAS as tabelas que possuem
 *    essa coluna (garante que RLS + filtros de tenant usem index scan).
 *  - FASE 2: índices compostos nos access-patterns de maior frequência
 *    (listagens paginadas, filtros por status, por site, por usuário).
 *  - FASE 3: índices especiais (login por CPF, lookup de e-mail).
 *
 * Todos os índices usam IF NOT EXISTS → idempotente e sem downtime
 * (não requer CONCURRENTLY pois é executado em banco vazio no deploy).
 */
export class PerformanceIndexes1709000000023 implements MigrationInterface {
  name = 'PerformanceIndexes1709000000023';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // -----------------------------------------------------------------------
    // FASE 1 — company_id em TODAS as tabelas (dinâmico)
    // -----------------------------------------------------------------------
    const rowsResult: unknown = await queryRunner.query(`
      SELECT DISTINCT table_name
      FROM information_schema.columns
      WHERE column_name = 'company_id'
        AND table_schema = 'public'
      ORDER BY table_name
    `);
    const rows = Array.isArray(rowsResult)
      ? rowsResult.filter(isInformationSchemaTableRow)
      : [];

    for (const { table_name } of rows) {
      const exists = await queryRunner.hasTable(table_name);
      if (!exists) continue;

      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "idx_${table_name}_company_id"
        ON "${table_name}" ("company_id")
      `);
    }

    // -----------------------------------------------------------------------
    // FASE 2 — Compostos para access-patterns de alta frequência
    // -----------------------------------------------------------------------

    // users — filtros mais comuns em listagem de funcionários
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_users_company_status"
      ON "users" ("company_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_users_company_site"
      ON "users" ("company_id", "site_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_users_company_created"
      ON "users" ("company_id", "created_at" DESC)
    `);

    // sites
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_sites_company_status"
      ON "sites" ("company_id", "status")
    `);

    // aprs — documento mais acessado do sistema
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_aprs_company_created"
      ON "aprs" ("company_id", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_aprs_company_status"
      ON "aprs" ("company_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_aprs_company_site"
      ON "aprs" ("company_id", "site_id")
    `);

    // pts
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pts_company_created"
      ON "pts" ("company_id", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pts_company_status"
      ON "pts" ("company_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pts_company_site"
      ON "pts" ("company_id", "site_id")
    `);

    // dds
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_dds_company_created"
      ON "dds" ("company_id", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_dds_company_site"
      ON "dds" ("company_id", "site_id")
    `);

    // checklists
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_checklists_company_created"
      ON "checklists" ("company_id", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_checklists_company_status"
      ON "checklists" ("company_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_checklists_company_site"
      ON "checklists" ("company_id", "site_id")
    `);

    // epi_assignments — histórico e rastreabilidade de EPIs
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_epi_assignments_company_user"
      ON "epi_assignments" ("company_id", "user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_epi_assignments_company_created"
      ON "epi_assignments" ("company_id", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_epi_assignments_company_status"
      ON "epi_assignments" ("company_id", "status")
    `);

    // cats — comunicação de acidente de trabalho
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_cats_company_created"
      ON "cats" ("company_id", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_cats_company_status"
      ON "cats" ("company_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_cats_company_site"
      ON "cats" ("company_id", "site_id")
    `);

    // trainings — treinamentos por funcionário
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_trainings_company_user"
      ON "trainings" ("company_id", "user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_trainings_company_created"
      ON "trainings" ("company_id", "created_at" DESC)
    `);

    // signatures — assinaturas por usuário
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_signatures_company_user"
      ON "signatures" ("company_id", "user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_signatures_company_created"
      ON "signatures" ("company_id", "created_at" DESC)
    `);

    // audits
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_audits_company_created"
      ON "audits" ("company_id", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_audits_company_site"
      ON "audits" ("company_id", "site_id")
    `);

    // inspections
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_inspections_company_created"
      ON "inspections" ("company_id", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_inspections_company_site"
      ON "inspections" ("company_id", "site_id")
    `);

    // nonconformities
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_nonconformities_company_created"
      ON "nonconformities" ("company_id", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_nonconformities_company_status"
      ON "nonconformities" ("company_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_nonconformities_company_site"
      ON "nonconformities" ("company_id", "site_id")
    `);

    // corrective_actions
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_corrective_actions_company_status"
      ON "corrective_actions" ("company_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_corrective_actions_company_created"
      ON "corrective_actions" ("company_id", "created_at" DESC)
    `);

    // contracts
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_contracts_company_status"
      ON "contracts" ("company_id", "status")
    `);

    // reports
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_reports_company_created"
      ON "reports" ("company_id", "created_at" DESC)
    `);

    // mail_logs — logs de e-mail para auditoria
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_mail_logs_company_created"
      ON "mail_logs" ("company_id", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_mail_logs_company_status"
      ON "mail_logs" ("company_id", "status")
    `);

    // -----------------------------------------------------------------------
    // FASE 3 — Índices especiais
    // -----------------------------------------------------------------------

    // CPF para login (busca cross-tenant — deve ser rápida mesmo sem index RLS)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_users_cpf"
      ON "users" ("cpf")
    `);

    // E-mail para deduplicação de envios no mail_logs
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_mail_logs_to"
      ON "mail_logs" ("to")
    `);

    // epi_assignments → epi_id para rastreabilidade de estoque
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_epi_assignments_epi_id"
      ON "epi_assignments" ("epi_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Fase 3
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_epi_assignments_epi_id"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_mail_logs_to"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_cpf"`);

    // Fase 2 — compostos
    const composites = [
      'idx_mail_logs_company_status',
      'idx_mail_logs_company_created',
      'idx_reports_company_created',
      'idx_contracts_company_status',
      'idx_corrective_actions_company_created',
      'idx_corrective_actions_company_status',
      'idx_nonconformities_company_site',
      'idx_nonconformities_company_status',
      'idx_nonconformities_company_created',
      'idx_inspections_company_site',
      'idx_inspections_company_created',
      'idx_audits_company_site',
      'idx_audits_company_created',
      'idx_signatures_company_created',
      'idx_signatures_company_user',
      'idx_trainings_company_created',
      'idx_trainings_company_user',
      'idx_cats_company_site',
      'idx_cats_company_status',
      'idx_cats_company_created',
      'idx_epi_assignments_company_status',
      'idx_epi_assignments_company_created',
      'idx_epi_assignments_company_user',
      'idx_checklists_company_site',
      'idx_checklists_company_status',
      'idx_checklists_company_created',
      'idx_dds_company_site',
      'idx_dds_company_created',
      'idx_pts_company_site',
      'idx_pts_company_status',
      'idx_pts_company_created',
      'idx_aprs_company_site',
      'idx_aprs_company_status',
      'idx_aprs_company_created',
      'idx_sites_company_status',
      'idx_users_company_created',
      'idx_users_company_site',
      'idx_users_company_status',
    ];

    for (const idx of composites) {
      await queryRunner.query(`DROP INDEX IF EXISTS "${idx}"`);
    }

    // Fase 1 — company_id dinâmicos
    const rowsResult: unknown = await queryRunner.query(`
      SELECT DISTINCT table_name
      FROM information_schema.columns
      WHERE column_name = 'company_id' AND table_schema = 'public'
    `);
    const rows = Array.isArray(rowsResult)
      ? rowsResult.filter(isInformationSchemaTableRow)
      : [];
    for (const { table_name } of rows) {
      await queryRunner.query(
        `DROP INDEX IF EXISTS "idx_${table_name}_company_id"`,
      );
    }
  }
}
