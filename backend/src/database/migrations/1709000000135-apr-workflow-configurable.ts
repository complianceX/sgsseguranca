import { MigrationInterface, QueryRunner } from 'typeorm';

export class AprWorkflowConfigurable1709000000135
  implements MigrationInterface
{
  name = 'AprWorkflowConfigurable1709000000135';

  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "apr_workflow_configs" (
        "id"           uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenantId"     uuid NULL,
        "siteId"       uuid NULL,
        "activityType" character varying(60) NULL,
        "criticality"  character varying(20) NULL,
        "name"         character varying(120) NOT NULL,
        "isDefault"    boolean NOT NULL DEFAULT false,
        "isActive"     boolean NOT NULL DEFAULT true,
        "createdAt"    timestamp NOT NULL DEFAULT now(),
        "updatedAt"    timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_apr_workflow_configs_id" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_apr_workflow_configs_criticality" CHECK (
          "criticality" IS NULL OR "criticality" IN ('BAIXA','MEDIA','ALTA','CRITICA')
        )
      )
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_apr_workflow_configs_tenant_active"
      ON "apr_workflow_configs" ("tenantId", "isActive")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "apr_workflow_steps" (
        "id"               uuid NOT NULL DEFAULT gen_random_uuid(),
        "workflowConfigId" uuid NOT NULL,
        "stepOrder"        integer NOT NULL,
        "roleName"         character varying(40) NOT NULL,
        "isRequired"       boolean NOT NULL DEFAULT true,
        "canDelegate"      boolean NOT NULL DEFAULT false,
        "timeoutHours"     integer NULL,
        "createdAt"        timestamp NOT NULL DEFAULT now(),
        "updatedAt"        timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_apr_workflow_steps_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_apr_workflow_steps_config" FOREIGN KEY ("workflowConfigId")
          REFERENCES "apr_workflow_configs"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "UQ_apr_workflow_steps_config_order"
      ON "apr_workflow_steps" ("workflowConfigId", "stepOrder")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "apr_approval_records" (
        "id"               uuid NOT NULL DEFAULT gen_random_uuid(),
        "aprId"            uuid NOT NULL,
        "workflowConfigId" uuid NULL,
        "stepOrder"        integer NOT NULL,
        "roleName"         character varying(40) NOT NULL,
        "approverId"       uuid NOT NULL,
        "action"           character varying(20) NOT NULL,
        "reason"           text NULL,
        "metadata"         jsonb NULL,
        "occurredAt"       timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_apr_approval_records_id" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_apr_approval_records_action" CHECK (
          "action" IN ('APROVADO','REPROVADO','REABERTO','DELEGADO')
        ),
        CONSTRAINT "FK_apr_approval_records_approver" FOREIGN KEY ("approverId")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_apr_approval_records_apr_step"
      ON "apr_approval_records" ("aprId", "stepOrder")
    `);

    await queryRunner.query(`
      ALTER TABLE "aprs"
        ADD COLUMN IF NOT EXISTS "workflowConfigId" uuid NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "aprs" DROP COLUMN IF EXISTS "workflowConfigId"`,
    );

    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_apr_approval_records_apr_step"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "apr_approval_records"`);

    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "UQ_apr_workflow_steps_config_order"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "apr_workflow_steps"`);

    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_apr_workflow_configs_tenant_active"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "apr_workflow_configs"`);
  }
}
