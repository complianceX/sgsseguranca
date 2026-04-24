import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGdprRetentionCleanupRuns1709000000147
  implements MigrationInterface
{
  name = 'CreateGdprRetentionCleanupRuns1709000000147';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "gdpr_retention_cleanup_runs" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "status" varchar(20) NOT NULL,
        "triggered_by" varchar(20) NOT NULL,
        "trigger_source" varchar(120) NOT NULL,
        "tables_cleaned" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "total_rows_deleted" integer NOT NULL DEFAULT 0,
        "duration_ms" integer NOT NULL DEFAULT 0,
        "error_message" text NULL,
        "started_at" timestamptz NOT NULL,
        "completed_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT "CHK_gdpr_retention_cleanup_runs_status"
          CHECK ("status" IN ('success', 'error')),
        CONSTRAINT "CHK_gdpr_retention_cleanup_runs_triggered_by"
          CHECK ("triggered_by" IN ('manual', 'scheduled'))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_gdpr_retention_cleanup_runs_created"
      ON "gdpr_retention_cleanup_runs" ("created_at" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_gdpr_retention_cleanup_runs_status_created"
      ON "gdpr_retention_cleanup_runs" ("status", "created_at" DESC)
    `);

    await queryRunner.query(`
      COMMENT ON TABLE "gdpr_retention_cleanup_runs" IS
      'LGPD retention evidence: each manual or scheduled TTL cleanup run and its per-table result.'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "gdpr_retention_cleanup_runs"`,
    );
  }
}
