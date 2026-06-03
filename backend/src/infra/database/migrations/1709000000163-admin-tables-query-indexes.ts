import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Índices de query para tabelas admin secundárias.
 *
 * forensic_trail_events: O índice composto existente (company_id, module, entity_id, created_at)
 * cobre queries por entidade específica. Este novo índice cobre queries de time-range por empresa
 * sem filtro de módulo/entidade (ex: listagem de auditoria por período).
 *
 * gdpr_deletion_requests: Já tem índices em user_id e status separados.
 * O índice composto (status, created_at DESC) cobre queries de processamento LGPD:
 * "encontrar pedidos pendentes mais antigos primeiro" sem multiple index scans.
 *
 * transaction = false: CONCURRENTLY exige autocommit.
 */
export class AdminTablesQueryIndexes1709000000163 implements MigrationInterface {
  name = 'AdminTablesQueryIndexes1709000000163';

  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('forensic_trail_events')) {
      await queryRunner.query(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_forensic_trail_events_company_occurred_at"
        ON "forensic_trail_events" ("company_id", "occurred_at" DESC)
        WHERE "company_id" IS NOT NULL
      `);
    }

    if (await queryRunner.hasTable('gdpr_deletion_requests')) {
      await queryRunner.query(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_gdpr_deletion_requests_status_created"
        ON "gdpr_deletion_requests" ("status", "created_at" DESC)
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_gdpr_deletion_requests_status_created"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_forensic_trail_events_company_occurred_at"`,
    );
  }
}
