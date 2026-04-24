import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePrivacyRequests1709000000146
  implements MigrationInterface
{
  name = 'CreatePrivacyRequests1709000000146';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "privacy_requests" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
        "requester_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "type" varchar(64) NOT NULL,
        "status" varchar(64) NOT NULL DEFAULT 'open',
        "description" text NULL,
        "response_summary" text NULL,
        "handled_by_user_id" uuid NULL REFERENCES "users"("id") ON DELETE SET NULL,
        "due_at" timestamptz NOT NULL,
        "fulfilled_at" timestamptz NULL,
        "rejected_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT "CHK_privacy_requests_type"
          CHECK ("type" IN (
            'confirmation',
            'access',
            'correction',
            'anonymization',
            'deletion',
            'portability',
            'sharing_info',
            'consent_revocation',
            'automated_decision_review'
          )),
        CONSTRAINT "CHK_privacy_requests_status"
          CHECK ("status" IN (
            'open',
            'in_review',
            'waiting_controller',
            'fulfilled',
            'rejected',
            'cancelled'
          ))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_privacy_requests_company_status_due"
      ON "privacy_requests" ("company_id", "status", "due_at")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_privacy_requests_requester_created"
      ON "privacy_requests" ("requester_user_id", "created_at" DESC)
    `);

    await queryRunner.query(
      `ALTER TABLE "privacy_requests" ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE "privacy_requests" FORCE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(`
      DROP POLICY IF EXISTS "tenant_isolation_privacy_requests"
      ON "privacy_requests"
    `);
    await queryRunner.query(`
      CREATE POLICY "tenant_isolation_privacy_requests"
      ON "privacy_requests"
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
      DROP POLICY IF EXISTS "tenant_isolation_privacy_requests"
      ON "privacy_requests"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "privacy_requests"`);
  }
}
