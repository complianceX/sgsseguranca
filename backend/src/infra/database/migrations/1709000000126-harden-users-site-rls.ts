import { MigrationInterface, QueryRunner } from 'typeorm';

export class HardenUsersSiteRls1709000000126 implements MigrationInterface {
  name = 'HardenUsersSiteRls1709000000126';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION current_app_user_id()
      RETURNS uuid AS $$
      BEGIN
        RETURN current_setting('app.current_user_id', true)::uuid;
      EXCEPTION
        WHEN others THEN
          RETURN NULL;
      END;
      $$ LANGUAGE plpgsql STABLE;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION current_site_id()
      RETURNS uuid AS $$
      BEGIN
        RETURN current_setting('app.current_site_id', true)::uuid;
      EXCEPTION
        WHEN others THEN
          RETURN NULL;
      END;
      $$ LANGUAGE plpgsql STABLE;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION current_site_scope()
      RETURNS text AS $$
      DECLARE
        scope_value text;
      BEGIN
        scope_value := current_setting('app.current_site_scope', true);
        IF scope_value IS NULL OR scope_value = '' THEN
          RETURN 'all';
        END IF;
        RETURN lower(scope_value);
      EXCEPTION
        WHEN others THEN
          RETURN 'all';
      END;
      $$ LANGUAGE plpgsql STABLE;
    `);

    await queryRunner.query(`
      ALTER TABLE "users" ENABLE ROW LEVEL SECURITY
    `);

    await queryRunner.query(`
      ALTER TABLE "users" FORCE ROW LEVEL SECURITY
    `);

    await queryRunner.query(`
      DROP POLICY IF EXISTS "users_site_isolation_policy" ON "users"
    `);

    await queryRunner.query(`
      CREATE POLICY "users_site_isolation_policy"
      ON "users"
      AS RESTRICTIVE
      FOR ALL
      USING (
        is_super_admin() = true
        OR (
          company_id = current_company()
          AND (
            current_site_scope() = 'all'
            OR id = current_app_user_id()
            OR site_id = current_site_id()
          )
        )
      )
      WITH CHECK (
        is_super_admin() = true
        OR (
          company_id = current_company()
          AND (
            current_site_scope() = 'all'
            OR id = current_app_user_id()
            OR site_id = current_site_id()
          )
        )
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP POLICY IF EXISTS "users_site_isolation_policy" ON "users"
    `);

    await queryRunner.query(`
      DROP FUNCTION IF EXISTS current_site_id()
    `);

    await queryRunner.query(`
      DROP FUNCTION IF EXISTS current_app_user_id()
    `);

    await queryRunner.query(`
      DROP FUNCTION IF EXISTS current_site_scope()
    `);
  }
}
