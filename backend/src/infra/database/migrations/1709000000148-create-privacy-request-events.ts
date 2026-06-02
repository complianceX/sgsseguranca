import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePrivacyRequestEvents1709000000148 implements MigrationInterface {
  name = 'CreatePrivacyRequestEvents1709000000148';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "privacy_request_events" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "privacy_request_id" uuid NOT NULL REFERENCES "privacy_requests"("id") ON DELETE CASCADE,
        "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
        "actor_user_id" uuid NULL REFERENCES "users"("id") ON DELETE SET NULL,
        "event_type" varchar(40) NOT NULL,
        "from_status" varchar(64) NULL,
        "to_status" varchar(64) NULL,
        "notes" text NULL,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT "CHK_privacy_request_events_type"
          CHECK ("event_type" IN ('created', 'status_changed', 'response_updated')),
        CONSTRAINT "CHK_privacy_request_events_from_status"
          CHECK (
            "from_status" IS NULL OR "from_status" IN (
              'open',
              'in_review',
              'waiting_controller',
              'fulfilled',
              'rejected',
              'cancelled'
            )
          ),
        CONSTRAINT "CHK_privacy_request_events_to_status"
          CHECK (
            "to_status" IS NULL OR "to_status" IN (
              'open',
              'in_review',
              'waiting_controller',
              'fulfilled',
              'rejected',
              'cancelled'
            )
          )
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_privacy_request_events_request_created"
      ON "privacy_request_events" ("privacy_request_id", "created_at" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_privacy_request_events_company_created"
      ON "privacy_request_events" ("company_id", "created_at" DESC)
    `);

    await queryRunner.query(
      `ALTER TABLE "privacy_request_events" ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE "privacy_request_events" FORCE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(`
      DROP POLICY IF EXISTS "tenant_isolation_privacy_request_events"
      ON "privacy_request_events"
    `);
    await queryRunner.query(`
      CREATE POLICY "tenant_isolation_privacy_request_events"
      ON "privacy_request_events"
      USING (
        "company_id" = current_company()
        OR is_super_admin()
      )
      WITH CHECK (
        "company_id" = current_company()
        OR is_super_admin()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP POLICY IF EXISTS "tenant_isolation_privacy_request_events"
      ON "privacy_request_events"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "privacy_request_events"`);
  }
}
