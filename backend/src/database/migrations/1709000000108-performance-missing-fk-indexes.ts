import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Performance: índices FK ausentes + índices de paginação triplos
 *
 * Problema: várias colunas FK usadas em JOINs e filtros de listagem não tinham
 * índice, causando sequential scans silenciosos (N+1 no PostgreSQL planner).
 *
 * Também criados índices triplos (company_id, status, created_at DESC) para
 * paginação eficiente com filtro de status no dashboard.
 *
 * OBRIGATÓRIO: transaction = false (CREATE INDEX CONCURRENTLY não pode
 * rodar dentro de transação explícita).
 */
export class PerformanceMissingFkIndexes1709000000108 implements MigrationInterface {
  name = 'PerformanceMissingFkIndexes1709000000108';
  transaction = false;

  private async hasColumns(
    queryRunner: QueryRunner,
    table: string,
    columns: string[],
  ): Promise<boolean> {
    for (const column of columns) {
      if (!(await queryRunner.hasColumn(table, column))) {
        return false;
      }
    }

    return true;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // =========================================================================
    // 1. Índices FK de autoria/responsabilidade
    //    Usados em queries de "listar documentos do elaborador X" ou joins
    //    em resposta de API que inclui dados do autor.
    // =========================================================================

    // APRs: elaborador_id é o criador do documento — filtro frequente em listagens
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_aprs_elaborador_id"
      ON "aprs" (elaborador_id)
    `);

    // APRs: aprovado_por_id — sparse, só tem valor em APRs aprovadas
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_aprs_aprovado_por_id"
      ON "aprs" (aprovado_por_id)
      WHERE aprovado_por_id IS NOT NULL
    `);

    // Checklists: inspetor_id — filtro "minhas inspeções"
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_checklists_inspetor_id"
      ON "checklists" (inspetor_id)
    `);

    // DDS: facilitador_id — filtro "minhas DDSs"
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_dds_facilitador_id"
      ON "dds" (facilitador_id)
    `);

    // PTs: responsavel_id — filtro "minhas PTs"
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_pts_responsavel_id"
      ON "pts" (responsavel_id)
      WHERE responsavel_id IS NOT NULL
    `);

    // Audits: auditor_id — JOIN frequente em relatórios de auditoria
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_audits_auditor_id"
      ON "audits" (auditor_id)
      WHERE auditor_id IS NOT NULL
    `);

    // Trainings: user_id — filtro "treinamentos do usuário X"
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_trainings_user_id"
      ON "trainings" (user_id)
    `);

    // Signatures: user_id — busca de assinaturas por signatário
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_signatures_user_id"
      ON "signatures" (user_id)
    `);

    // =========================================================================
    // 2. Índices triplos para paginação com filtro de status
    //    Padrão: (company_id, status, created_at DESC) WHERE deleted_at IS NULL
    //    Cobre queries do tipo:
    //      WHERE company_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT 20
    // =========================================================================

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_aprs_company_status_created"
      ON "aprs" (company_id, status, created_at DESC)
      WHERE deleted_at IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_pts_company_status_created"
      ON "pts" (company_id, status, created_at DESC)
      WHERE deleted_at IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_checklists_company_status_created"
      ON "checklists" (company_id, status, created_at DESC)
      WHERE deleted_at IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_nonconformities_company_status_created"
      ON "nonconformities" (company_id, status, created_at DESC)
      WHERE deleted_at IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_dds_company_status_created"
      ON "dds" (company_id, status, created_at DESC)
      WHERE deleted_at IS NULL
    `);

    if (
      await this.hasColumns(queryRunner, 'audits', [
        'company_id',
        'status',
        'created_at',
        'deleted_at',
      ])
    ) {
      await queryRunner.query(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_audits_company_status_created"
        ON "audits" (company_id, status, created_at DESC)
        WHERE deleted_at IS NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const indexes = [
      'idx_audits_company_status_created',
      'idx_dds_company_status_created',
      'idx_nonconformities_company_status_created',
      'idx_checklists_company_status_created',
      'idx_pts_company_status_created',
      'idx_aprs_company_status_created',
      'idx_signatures_user_id',
      'idx_trainings_user_id',
      'idx_audits_auditor_id',
      'idx_pts_responsavel_id',
      'idx_dds_facilitador_id',
      'idx_checklists_inspetor_id',
      'idx_aprs_aprovado_por_id',
      'idx_aprs_elaborador_id',
    ];

    for (const index of indexes) {
      await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "${index}"`);
    }
  }
}
