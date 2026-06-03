import { MigrationInterface, QueryRunner } from 'typeorm';

export class DdsApprovalFlow1709000000138 implements MigrationInterface {
  name = 'DdsApprovalFlow1709000000138';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "dds_approval_records" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "company_id" uuid NOT NULL,
        "dds_id" uuid NOT NULL,
        "cycle" integer NOT NULL,
        "level_order" integer NOT NULL,
        "title" character varying(120) NOT NULL,
        "approver_role" character varying(120) NOT NULL,
        "action" character varying(24) NOT NULL,
        "actor_user_id" uuid NULL,
        "actor_signature_id" uuid NULL,
        "actor_signature_hash" character varying(64) NULL,
        "actor_signature_signed_at" timestamp NULL,
        "actor_signature_timestamp_authority" character varying(120) NULL,
        "decision_reason" text NULL,
        "decided_ip" character varying(64) NULL,
        "decided_user_agent" text NULL,
        "event_at" timestamp NOT NULL,
        "previous_event_hash" character varying(64) NULL,
        "event_hash" character varying(64) NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_dds_approval_records_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_dds_approval_records_company_id" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_dds_approval_records_dds_id" FOREIGN KEY ("dds_id") REFERENCES "dds"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_dds_approval_records_actor_user_id" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_dds_approval_records_actor_signature_id" FOREIGN KEY ("actor_signature_id") REFERENCES "signatures"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_dds_approval_records_action" CHECK ("action" IN ('pending','approved','rejected','canceled','reopened')),
        CONSTRAINT "CHK_dds_approval_records_cycle_positive" CHECK ("cycle" >= 1),
        CONSTRAINT "CHK_dds_approval_records_level_non_negative" CHECK ("level_order" >= 0)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_dds_approval_records_dds_cycle"
      ON "dds_approval_records" ("company_id", "dds_id", "cycle", "level_order")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_dds_approval_records_hash"
      ON "dds_approval_records" ("event_hash")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_dds_approval_records_pending_unique"
      ON "dds_approval_records" ("company_id", "dds_id", "cycle", "level_order")
      WHERE "action" = 'pending'
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_dds_approval_records_decision_unique"
      ON "dds_approval_records" ("company_id", "dds_id", "cycle", "level_order")
      WHERE "action" IN ('approved', 'rejected', 'canceled')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_dds_approval_records_decision_unique"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_dds_approval_records_pending_unique"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_dds_approval_records_hash"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_dds_approval_records_dds_cycle"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "dds_approval_records"`);
  }
}
