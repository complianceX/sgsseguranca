import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserIdentityAccessClassification1709000000189 implements MigrationInterface {
  name = 'AddUserIdentityAccessClassification1709000000189';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET lock_timeout = '2s'`);
    await queryRunner.query(`SET statement_timeout = '45s'`);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "identity_type" varchar(32),
      ADD COLUMN IF NOT EXISTS "access_status" varchar(32)
    `);

    await queryRunner.query(`
      UPDATE "users"
      SET "identity_type" = CASE
        WHEN "auth_user_id" IS NOT NULL THEN 'system_user'
        WHEN "password" IS NOT NULL AND btrim("password") <> '' THEN 'system_user'
        WHEN "email" IS NOT NULL AND btrim("email") <> '' THEN 'system_user'
        ELSE 'employee_signer'
      END
      WHERE "identity_type" IS NULL
        OR "identity_type" NOT IN ('system_user', 'employee_signer')
    `);

    await queryRunner.query(`
      UPDATE "users"
      SET "access_status" = CASE
        WHEN "auth_user_id" IS NOT NULL THEN 'credentialed'
        WHEN "password" IS NOT NULL AND btrim("password") <> '' THEN 'credentialed'
        WHEN "identity_type" = 'employee_signer' THEN 'no_login'
        ELSE 'missing_credentials'
      END
      WHERE "access_status" IS NULL
        OR "access_status" NOT IN (
          'credentialed',
          'no_login',
          'missing_credentials'
        )
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ALTER COLUMN "identity_type" SET DEFAULT 'system_user',
      ALTER COLUMN "access_status" SET DEFAULT 'credentialed'
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      DROP CONSTRAINT IF EXISTS "CHK_users_identity_type"
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD CONSTRAINT "CHK_users_identity_type"
      CHECK (
        "identity_type" IS NOT NULL
        AND "identity_type" IN ('system_user', 'employee_signer')
      )
      NOT VALID
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      VALIDATE CONSTRAINT "CHK_users_identity_type"
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      DROP CONSTRAINT IF EXISTS "CHK_users_access_status"
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD CONSTRAINT "CHK_users_access_status"
      CHECK (
        "access_status" IS NOT NULL
        AND "access_status" IN (
          'credentialed',
          'no_login',
          'missing_credentials'
        )
      )
      NOT VALID
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      VALIDATE CONSTRAINT "CHK_users_access_status"
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_users_company_identity_status"
      ON "users" ("company_id", "identity_type", "status", "nome", "id")
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_users_company_access_status"
      ON "users" ("company_id", "access_status", "status", "id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET lock_timeout = '2s'`);
    await queryRunner.query(`SET statement_timeout = '45s'`);

    await queryRunner.query(`
      DROP INDEX CONCURRENTLY IF EXISTS "IDX_users_company_access_status"
    `);
    await queryRunner.query(`
      DROP INDEX CONCURRENTLY IF EXISTS "IDX_users_company_identity_status"
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP CONSTRAINT IF EXISTS "CHK_users_access_status"
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP CONSTRAINT IF EXISTS "CHK_users_identity_type"
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "access_status",
      DROP COLUMN IF EXISTS "identity_type"
    `);
  }
}
