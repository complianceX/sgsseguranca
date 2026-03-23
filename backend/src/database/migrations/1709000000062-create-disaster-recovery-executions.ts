import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDisasterRecoveryExecutions1709000000062 implements MigrationInterface {
  name = 'CreateDisasterRecoveryExecutions1709000000062';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "disaster_recovery_executions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "operation_type" varchar(50) NOT NULL,
        "scope" varchar(20) NOT NULL,
        "environment" varchar(50) NOT NULL,
        "target_environment" varchar(50),
        "status" varchar(50) NOT NULL,
        "trigger_source" varchar(50) NOT NULL,
        "requested_by_user_id" varchar(120),
        "backup_name" varchar(180),
        "artifact_path" text,
        "artifact_storage_key" text,
        "error_message" text,
        "metadata" jsonb,
        "started_at" timestamptz NOT NULL,
        "completed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_disaster_recovery_executions" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_dr_execution_operation_environment_started"
      ON "disaster_recovery_executions" ("operation_type", "environment", "started_at")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_dr_execution_status_started"
      ON "disaster_recovery_executions" ("status", "started_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_dr_execution_status_started"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_dr_execution_operation_environment_started"
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "disaster_recovery_executions"
    `);
  }
}
