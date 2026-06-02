import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserSites1709000000201 implements MigrationInterface {
  name = 'CreateUserSites1709000000201';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_sites" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "company_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "site_id" uuid NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_sites" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_user_sites_user_site" UNIQUE ("user_id", "site_id"),
        CONSTRAINT "FK_user_sites_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_sites_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_sites_site" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_sites_company_site"
      ON "user_sites" ("company_id", "site_id")
    `);

    await queryRunner.query(`
      INSERT INTO "user_sites" ("company_id", "user_id", "site_id")
      SELECT u."company_id", u."id", u."site_id"
      FROM "users" u
      INNER JOIN "sites" s
        ON s."id" = u."site_id"
       AND s."company_id" = u."company_id"
      WHERE u."site_id" IS NOT NULL
      ON CONFLICT ("user_id", "site_id") DO NOTHING
    `);

    await queryRunner.query(
      `ALTER TABLE "user_sites" ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_sites" FORCE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(`
      DROP POLICY IF EXISTS "tenant_isolation_policy" ON "user_sites"
    `);
    await queryRunner.query(`
      CREATE POLICY "tenant_isolation_policy"
      ON "user_sites"
      USING (
        company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
      )
      WITH CHECK (
        company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP POLICY IF EXISTS "tenant_isolation_policy" ON "user_sites"
    `);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_user_sites_company_site"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "user_sites"`);
  }
}
