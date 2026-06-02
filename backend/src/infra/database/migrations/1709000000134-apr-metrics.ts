import { MigrationInterface, QueryRunner } from 'typeorm';

export class AprMetrics1709000000134 implements MigrationInterface {
  name = 'AprMetrics1709000000134';

  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "apr_metrics" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "aprId" uuid NOT NULL,
        "tenantId" character varying NULL,
        "eventType" character varying(40) NOT NULL,
        "durationMs" integer NULL,
        "errorStep" character varying(120) NULL,
        "metadata" jsonb NULL,
        "occurredAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_apr_metrics_id" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_apr_metrics_event_type" CHECK (
          "eventType" IN (
            'APR_OPENED',
            'APR_SAVED',
            'APR_PDF_GENERATED',
            'APR_APPROVED',
            'APR_REJECTED',
            'APR_STEP_ERROR'
          )
        )
      )
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_apr_metrics_apr_id"
      ON "apr_metrics" ("aprId")
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_apr_metrics_tenant_event"
      ON "apr_metrics" ("tenantId", "eventType")
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_apr_metrics_occurred_at"
      ON "apr_metrics" ("occurredAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_apr_metrics_occurred_at"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_apr_metrics_tenant_event"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_apr_metrics_apr_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "apr_metrics"`);
  }
}
