import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlignIdentitySessionSchema1709000000124
  implements MigrationInterface
{
  name = 'AlignIdentitySessionSchema1709000000124';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "auth_user_id" uuid
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_auth_user_id"
      ON "users" ("auth_user_id")
      WHERE "auth_user_id" IS NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "user_sessions"
      ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMPTZ
    `);

    await queryRunner.query(`
      UPDATE "user_sessions"
      SET "expires_at" = COALESCE("expires_at", now() + interval '30 days')
      WHERE "expires_at" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "user_sessions"
      ALTER COLUMN "expires_at" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "user_sessions"
      ADD COLUMN IF NOT EXISTS "revoked_at" TIMESTAMPTZ
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_sessions_user_active_expires"
      ON "user_sessions" ("user_id", "is_active", "expires_at")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_sessions_active_not_revoked"
      ON "user_sessions" ("company_id", "last_active")
      WHERE "is_active" = true AND "revoked_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_user_sessions_active_not_revoked"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_user_sessions_user_active_expires"
    `);
    await queryRunner.query(`
      ALTER TABLE "user_sessions"
      DROP COLUMN IF EXISTS "revoked_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "user_sessions"
      DROP COLUMN IF EXISTS "expires_at"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_users_auth_user_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "auth_user_id"
    `);
  }
}
