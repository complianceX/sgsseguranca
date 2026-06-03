import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompanyTrialLifecycle1709000000208 implements MigrationInterface {
  name = 'AddCompanyTrialLifecycle1709000000208';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "companies"
        ADD COLUMN IF NOT EXISTS "account_status" varchar(32) NOT NULL DEFAULT 'active',
        ADD COLUMN IF NOT EXISTS "trial_started_at" timestamptz NULL,
        ADD COLUMN IF NOT EXISTS "trial_ends_at" timestamptz NULL,
        ADD COLUMN IF NOT EXISTS "activated_at" timestamptz NULL,
        ADD COLUMN IF NOT EXISTS "suspended_at" timestamptz NULL,
        ADD COLUMN IF NOT EXISTS "suspension_reason" text NULL
    `);

    await queryRunner.query(`
      UPDATE "companies"
         SET "account_status" = CASE
           WHEN "status" = true THEN 'active'
           ELSE 'suspended'
         END
       WHERE "account_status" IS NULL
          OR "account_status" NOT IN ('trialing', 'active', 'trial_expired', 'suspended', 'cancelled')
    `);

    await queryRunner.query(`
      ALTER TABLE "companies"
        DROP CONSTRAINT IF EXISTS "CHK_companies_account_status"
    `);
    await queryRunner.query(`
      ALTER TABLE "companies"
        ADD CONSTRAINT "CHK_companies_account_status"
        CHECK (
          "account_status" IN (
            'trialing',
            'active',
            'trial_expired',
            'suspended',
            'cancelled'
          )
        )
    `);
    await queryRunner.query(`
      ALTER TABLE "companies"
        VALIDATE CONSTRAINT "CHK_companies_account_status"
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_companies_account_status_trial"
      ON "companies" ("account_status", "trial_ends_at")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tenant_onboarding_invites" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "token_hash" varchar(64) NOT NULL UNIQUE,
        "email" varchar(255) NOT NULL,
        "intended_company_name" varchar(255) NULL,
        "expires_at" timestamptz NOT NULL,
        "used_at" timestamptz NULL,
        "revoked_at" timestamptz NULL,
        "created_by_user_id" uuid NULL,
        "created_company_id" uuid NULL,
        "created_user_id" uuid NULL,
        "metadata" jsonb NULL,
        "created_at" timestamptz DEFAULT now() NOT NULL,
        "updated_at" timestamptz DEFAULT now() NOT NULL,
        CONSTRAINT "FK_tenant_onboarding_invites_created_company"
          FOREIGN KEY ("created_company_id") REFERENCES "companies"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_tenant_onboarding_invites_created_user"
          FOREIGN KEY ("created_user_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_tenant_onboarding_invites_email"
      ON "tenant_onboarding_invites" ("email")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_tenant_onboarding_invites_expires"
      ON "tenant_onboarding_invites" ("expires_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_tenant_onboarding_invites_expires"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_tenant_onboarding_invites_email"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "tenant_onboarding_invites"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_companies_account_status_trial"`,
    );
    await queryRunner.query(`
      ALTER TABLE "companies"
        DROP CONSTRAINT IF EXISTS "CHK_companies_account_status"
    `);
    await queryRunner.query(`
      ALTER TABLE "companies"
        DROP COLUMN IF EXISTS "suspension_reason",
        DROP COLUMN IF EXISTS "suspended_at",
        DROP COLUMN IF EXISTS "activated_at",
        DROP COLUMN IF EXISTS "trial_ends_at",
        DROP COLUMN IF EXISTS "trial_started_at",
        DROP COLUMN IF EXISTS "account_status"
    `);
  }
}
