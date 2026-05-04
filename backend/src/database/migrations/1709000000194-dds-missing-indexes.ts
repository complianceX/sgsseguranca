import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adiciona índices faltando no módulo DDS para performance em queries críticas:
 *
 * 1. IDX_dds_approval_records_actor_user_id — buscar todos eventos de um usuário
 * 2. IDX_dds_approval_records_event_at — range queries por timestamp de evento
 * 3. IDX_dds_company_data — relatórios por período (company + data do DDS)
 */
export class DdsMissingIndexes1709000000194 implements MigrationInterface {
  name = 'DdsMissingIndexes1709000000194';

  // CONCURRENTLY não pode rodar dentro de transação
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Index para queries: "todos eventos aprovados pelo usuário X"
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_dds_approval_records_actor_user_id"
      ON "dds_approval_records" ("actor_user_id")
    `);

    // Index para queries de range por data de evento (histórico cronológico)
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_dds_approval_records_event_at"
      ON "dds_approval_records" ("event_at")
    `);

    // Index para relatórios por período da data do DDS (não confundir com created_at)
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_dds_company_data"
      ON "dds" ("company_id", "data")
      WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "public"."IDX_dds_approval_records_actor_user_id"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "public"."IDX_dds_approval_records_event_at"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "public"."IDX_dds_company_data"`,
    );
  }
}
