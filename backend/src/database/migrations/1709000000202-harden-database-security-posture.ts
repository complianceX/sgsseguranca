import { MigrationInterface, QueryRunner } from 'typeorm';

export class HardenDatabaseSecurityPosture1709000000202
  implements MigrationInterface
{
  name = 'HardenDatabaseSecurityPosture1709000000202';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.current_app_user_id()
      RETURNS uuid AS $$
      BEGIN
        RETURN current_setting('app.current_user_id', true)::uuid;
      EXCEPTION
        WHEN others THEN
          RETURN NULL;
      END;
      $$ LANGUAGE plpgsql STABLE
         SET search_path = public;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.current_site_id()
      RETURNS uuid AS $$
      BEGIN
        RETURN current_setting('app.current_site_id', true)::uuid;
      EXCEPTION
        WHEN others THEN
          RETURN NULL;
      END;
      $$ LANGUAGE plpgsql STABLE
         SET search_path = public;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.current_site_scope()
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
      $$ LANGUAGE plpgsql STABLE
         SET search_path = public;
    `);

    await queryRunner.query(`
      ALTER TABLE "user_sites" ENABLE ROW LEVEL SECURITY
    `);

    await queryRunner.query(`
      ALTER TABLE "user_sites" FORCE ROW LEVEL SECURITY
    `);

    await queryRunner.query(`
      DROP POLICY IF EXISTS "tenant_isolation_policy" ON "user_sites"
    `);

    await queryRunner.query(`
      CREATE POLICY "tenant_isolation_policy"
      ON "user_sites"
      FOR ALL
      USING (
        company_id = current_company()
        OR is_super_admin() = true
      )
      WITH CHECK (
        company_id = current_company()
        OR is_super_admin() = true
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_sites_site"
      ON "user_sites" ("site_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_expense_advances_created_by"
      ON "expense_advances" ("created_by_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_expense_items_created_by"
      ON "expense_items" ("created_by_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_expense_reports_closed_by"
      ON "expense_reports" ("closed_by_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_expense_reports_responsible"
      ON "expense_reports" ("responsible_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_expense_reports_site"
      ON "expense_reports" ("site_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_expense_reports_site"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_expense_reports_responsible"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_expense_reports_closed_by"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_expense_items_created_by"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_expense_advances_created_by"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_user_sites_site"
    `);

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

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.current_app_user_id()
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
      CREATE OR REPLACE FUNCTION public.current_site_id()
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
      CREATE OR REPLACE FUNCTION public.current_site_scope()
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
  }
}
