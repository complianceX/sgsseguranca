import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase4IdentityHardening1709000000123 implements MigrationInterface {
  name = 'Phase4IdentityHardening1709000000123';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_mfa_credentials" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "company_id" uuid NOT NULL,
        "type" character varying(32) NOT NULL DEFAULT 'totp',
        "secret_ciphertext" text NOT NULL,
        "secret_iv" character varying(64) NOT NULL,
        "secret_tag" character varying(64) NOT NULL,
        "secret_version" integer NOT NULL DEFAULT 1,
        "label" character varying(120),
        "is_enabled" boolean NOT NULL DEFAULT false,
        "verified_at" TIMESTAMPTZ,
        "disabled_at" TIMESTAMPTZ,
        "last_used_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_mfa_credentials_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_user_mfa_credentials_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_user_mfa_credentials_user_type"
      ON "user_mfa_credentials" ("user_id", "type")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_mfa_recovery_codes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "credential_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "company_id" uuid NOT NULL,
        "code_hash" text NOT NULL,
        "consumed_at" TIMESTAMPTZ,
        "last_used_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_mfa_recovery_codes_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_user_mfa_recovery_codes_credential_id" FOREIGN KEY ("credential_id") REFERENCES "user_mfa_credentials"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_mfa_recovery_codes_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_mfa_recovery_codes_user_consumed"
      ON "user_mfa_recovery_codes" ("user_id", "consumed_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_user_mfa_recovery_codes_user_consumed"
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "user_mfa_recovery_codes"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_user_mfa_credentials_user_type"
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "user_mfa_credentials"
    `);
  }
}
