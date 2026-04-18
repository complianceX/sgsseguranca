import { MigrationInterface, QueryRunner } from 'typeorm';

export class AprEnterprisePhase2WorkflowAndAuthenticity1709000000132
  implements MigrationInterface
{
  name = 'AprEnterprisePhase2WorkflowAndAuthenticity1709000000132';

  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "aprs"
        ADD COLUMN IF NOT EXISTS "turno" character varying(40),
        ADD COLUMN IF NOT EXISTS "local_execucao_detalhado" character varying(200),
        ADD COLUMN IF NOT EXISTS "responsavel_tecnico_nome" character varying(160),
        ADD COLUMN IF NOT EXISTS "responsavel_tecnico_registro" character varying(80),
        ADD COLUMN IF NOT EXISTS "final_pdf_hash_sha256" character varying(64),
        ADD COLUMN IF NOT EXISTS "verification_code" character varying(24),
        ADD COLUMN IF NOT EXISTS "pdf_generated_at" timestamp
    `);

    await queryRunner.query(`
      ALTER TABLE "apr_risk_items"
        ADD COLUMN IF NOT EXISTS "epc" text,
        ADD COLUMN IF NOT EXISTS "epi" text,
        ADD COLUMN IF NOT EXISTS "permissao_trabalho" character varying(120),
        ADD COLUMN IF NOT EXISTS "normas_relacionadas" text
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "apr_approval_steps" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "apr_id" uuid NOT NULL,
        "level_order" integer NOT NULL,
        "title" character varying(120) NOT NULL,
        "approver_role" character varying(120) NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'pending',
        "approver_user_id" uuid NULL,
        "decision_reason" text NULL,
        "decided_ip" inet NULL,
        "decided_at" timestamp NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_apr_approval_steps_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_apr_approval_steps_apr_id" FOREIGN KEY ("apr_id") REFERENCES "aprs"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_apr_approval_steps_approver_user_id" FOREIGN KEY ("approver_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_apr_approval_steps_status" CHECK ("status" IN ('pending','approved','rejected','skipped'))
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "UQ_apr_approval_steps_apr_level"
      ON "apr_approval_steps" ("apr_id", "level_order")
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_apr_approval_steps_pending"
      ON "apr_approval_steps" ("apr_id", "status", "level_order")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "UQ_aprs_verification_code_active"
      ON "aprs" ("verification_code")
      WHERE "verification_code" IS NOT NULL AND "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "UQ_aprs_verification_code_active"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_apr_approval_steps_pending"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "UQ_apr_approval_steps_apr_level"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "apr_approval_steps"`);

    await queryRunner.query(`
      ALTER TABLE "apr_risk_items"
        DROP COLUMN IF EXISTS "normas_relacionadas",
        DROP COLUMN IF EXISTS "permissao_trabalho",
        DROP COLUMN IF EXISTS "epi",
        DROP COLUMN IF EXISTS "epc"
    `);

    await queryRunner.query(`
      ALTER TABLE "aprs"
        DROP COLUMN IF EXISTS "pdf_generated_at",
        DROP COLUMN IF EXISTS "verification_code",
        DROP COLUMN IF EXISTS "final_pdf_hash_sha256",
        DROP COLUMN IF EXISTS "responsavel_tecnico_registro",
        DROP COLUMN IF EXISTS "responsavel_tecnico_nome",
        DROP COLUMN IF EXISTS "local_execucao_detalhado",
        DROP COLUMN IF EXISTS "turno"
    `);
  }
}
