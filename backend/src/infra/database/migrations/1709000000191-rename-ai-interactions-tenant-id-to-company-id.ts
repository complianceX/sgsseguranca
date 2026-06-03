import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Renames `tenant_id` → `company_id` in `ai_interactions` (and all its
 * monthly partitions) to align with the naming convention used across every
 * other multi-tenant table in the project.
 *
 * Safety notes:
 * - PostgreSQL propagates RENAME COLUMN from a partitioned parent to all
 *   child partitions automatically (PG 12+).
 * - RLS policies are stored as expression trees (not plain text), so they
 *   keep working after the rename without needing to be recreated.
 * - The trigger function `sync_ai_interactions_uuid_refs()` references the
 *   column by name in PL/pgSQL, so it must be updated explicitly.
 * - The trigger must be dropped before the rename and recreated after,
 *   because its UPDATE OF clause references the column by name.
 * - No index recreation is needed: indexes reference columns by attnum, which
 *   does not change during a rename.
 *
 * transaction = true (default): the whole operation is atomic.
 */
export class RenameAiInteractionsTenantIdToCompanyId1709000000191 implements MigrationInterface {
  name = 'RenameAiInteractionsTenantIdToCompanyId1709000000191';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('ai_interactions'))) {
      return;
    }

    // 1. Drop trigger (references column by name in UPDATE OF clause).
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "trg_ai_interactions_uuid_refs" ON "ai_interactions"
    `);

    // 2. Update the trigger function body to reference company_id.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.sync_ai_interactions_uuid_refs()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      DECLARE
        parsed_tenant uuid;
        parsed_user uuid;
        existing_user uuid;
      BEGIN
        parsed_tenant := public.try_parse_uuid(NEW.company_id::text);
        parsed_user := public.try_parse_uuid(NEW.user_id::text);

        NEW.tenant_uuid := parsed_tenant;

        IF parsed_user IS NULL THEN
          NEW.user_uuid := NULL;
          NEW.user_ref_status := 'invalid_uuid';
        ELSE
          SELECT u.id INTO existing_user
          FROM public.users u
          WHERE u.id = parsed_user
          LIMIT 1;

          IF existing_user IS NULL THEN
            NEW.user_uuid := NULL;
            NEW.user_ref_status := 'missing_user';
          ELSE
            NEW.user_uuid := existing_user;
            NEW.user_ref_status := 'valid_user';
          END IF;
        END IF;

        RETURN NEW;
      END;
      $$
    `);

    // 3. Rename column on the partitioned parent — cascades to all children.
    await queryRunner.query(`
      ALTER TABLE "ai_interactions" RENAME COLUMN "tenant_id" TO "company_id"
    `);

    // 4. Recreate the trigger with the updated column name.
    await queryRunner.query(`
      CREATE TRIGGER "trg_ai_interactions_uuid_refs"
      BEFORE INSERT OR UPDATE OF "company_id", "user_id"
      ON "ai_interactions"
      FOR EACH ROW
      EXECUTE FUNCTION public.sync_ai_interactions_uuid_refs()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('ai_interactions'))) {
      return;
    }

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "trg_ai_interactions_uuid_refs" ON "ai_interactions"
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.sync_ai_interactions_uuid_refs()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      DECLARE
        parsed_tenant uuid;
        parsed_user uuid;
        existing_user uuid;
      BEGIN
        parsed_tenant := public.try_parse_uuid(NEW.tenant_id::text);
        parsed_user := public.try_parse_uuid(NEW.user_id::text);

        NEW.tenant_uuid := parsed_tenant;

        IF parsed_user IS NULL THEN
          NEW.user_uuid := NULL;
          NEW.user_ref_status := 'invalid_uuid';
        ELSE
          SELECT u.id INTO existing_user
          FROM public.users u
          WHERE u.id = parsed_user
          LIMIT 1;

          IF existing_user IS NULL THEN
            NEW.user_uuid := NULL;
            NEW.user_ref_status := 'missing_user';
          ELSE
            NEW.user_uuid := existing_user;
            NEW.user_ref_status := 'valid_user';
          END IF;
        END IF;

        RETURN NEW;
      END;
      $$
    `);

    await queryRunner.query(`
      ALTER TABLE "ai_interactions" RENAME COLUMN "company_id" TO "tenant_id"
    `);

    await queryRunner.query(`
      CREATE TRIGGER "trg_ai_interactions_uuid_refs"
      BEFORE INSERT OR UPDATE OF "tenant_id", "user_id"
      ON "ai_interactions"
      FOR EACH ROW
      EXECUTE FUNCTION public.sync_ai_interactions_uuid_refs()
    `);
  }
}
