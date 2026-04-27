import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Neon enterprise3 baseline:
 * - corrige lacuna LGPD em mail_logs.deleted_at usada por export/delete flows;
 * - adiciona indices compostos para listagens tenant-scoped e consultas de titular;
 * - evita transacao porque CREATE INDEX CONCURRENTLY precisa rodar fora dela.
 */
export class NeonEnterprise3DatabaseTuning1709000000149 implements MigrationInterface {
  name = 'NeonEnterprise3DatabaseTuning1709000000149';

  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "mail_logs"
      ADD COLUMN IF NOT EXISTS "deleted_at" timestamp
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_mail_logs_company_user_active"
      ON "mail_logs" ("company_id", "user_id")
      WHERE "deleted_at" IS NULL AND "user_id" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_mail_logs_company_created_active"
      ON "mail_logs" ("company_id", "created_at" DESC)
      WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_mail_logs_company_status_created_active"
      ON "mail_logs" ("company_id", "status", "created_at" DESC)
      WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_ai_interactions_tenant_user_active"
      ON "ai_interactions" ("tenant_id", "user_id")
      WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_user_roles_role_user"
      ON "user_roles" ("role_id", "user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_users_company_site_nome"
      ON "users" ("company_id", "site_id", "nome", "id")
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_users_company_nome"
      ON "users" ("company_id", "nome", "id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_users_company_nome"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_users_company_site_nome"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_user_roles_role_user"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_ai_interactions_tenant_user_active"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_mail_logs_company_status_created_active"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_mail_logs_company_created_active"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_mail_logs_company_user_active"`,
    );
    await queryRunner.query(`
      ALTER TABLE "mail_logs"
      DROP COLUMN IF EXISTS "deleted_at"
    `);
  }
}
