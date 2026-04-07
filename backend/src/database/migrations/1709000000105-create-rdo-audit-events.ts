import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRdoAuditEvents1709000000105
  implements MigrationInterface
{
  name = 'CreateRdoAuditEvents1709000000105';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "rdo_audit_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "rdo_id" uuid NOT NULL,
        "user_id" uuid NULL,
        "event_type" character varying NOT NULL,
        "details" jsonb NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_rdo_audit_events_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'FK_rdo_audit_events_rdo_id'
        ) THEN
          ALTER TABLE "rdo_audit_events"
            ADD CONSTRAINT "FK_rdo_audit_events_rdo_id"
            FOREIGN KEY ("rdo_id") REFERENCES "rdos"("id")
            ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'FK_rdo_audit_events_user_id'
        ) THEN
          ALTER TABLE "rdo_audit_events"
            ADD CONSTRAINT "FK_rdo_audit_events_user_id"
            FOREIGN KEY ("user_id") REFERENCES "users"("id")
            ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_rdo_audit_events_rdo_created"
      ON "rdo_audit_events" ("rdo_id", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_rdo_audit_events_rdo_created"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rdo_audit_events" DROP CONSTRAINT IF EXISTS "FK_rdo_audit_events_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rdo_audit_events" DROP CONSTRAINT IF EXISTS "FK_rdo_audit_events_rdo_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "rdo_audit_events"`);
  }
}
