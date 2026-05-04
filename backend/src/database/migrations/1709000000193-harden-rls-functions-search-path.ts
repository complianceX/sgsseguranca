import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `SET search_path = public` to all PL/pgSQL functions used in RLS policies.
 *
 * Why this matters:
 *   Without an explicit search_path, a PL/pgSQL function resolves identifiers
 *   (tables, functions, types) using the session's current search_path. If an
 *   attacker or misconfigured session inserts a malicious schema at the front of
 *   search_path, functions like current_company() or is_super_admin() could
 *   resolve to attacker-controlled versions — bypassing tenant isolation.
 *
 *   SET search_path = public pins the function's resolution context regardless
 *   of the caller's session search_path. This is a required hardening step for
 *   any function referenced in RLS USING / WITH CHECK expressions.
 *
 * Functions hardened:
 *   - public.current_company()         — used in ALL tenant isolation policies
 *   - public.is_super_admin()          — used in ALL tenant isolation policies
 *   - public.current_user_role()       — used in RBAC-scoped policies
 *   - public.try_parse_uuid(text)      — used in ai_interactions trigger
 *
 * transaction = true (default): all functions are replaced atomically.
 * No data is affected — these are schema-level changes only.
 */
export class HardenRlsFunctionsSearchPath1709000000193
  implements MigrationInterface
{
  name = 'HardenRlsFunctionsSearchPath1709000000193';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.current_company()
      RETURNS uuid AS $$
      BEGIN
        RETURN current_setting('app.current_company_id', true)::uuid;
      EXCEPTION
        WHEN others THEN
          RETURN NULL;
      END;
      $$ LANGUAGE plpgsql STABLE
         SET search_path = public;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.is_super_admin()
      RETURNS boolean AS $$
      BEGIN
        RETURN coalesce(
          current_setting('app.is_super_admin', true)::boolean,
          false
        );
      EXCEPTION
        WHEN others THEN
          RETURN false;
      END;
      $$ LANGUAGE plpgsql STABLE
         SET search_path = public;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.current_user_role()
      RETURNS text AS $$
      BEGIN
        RETURN coalesce(
          current_setting('app.user_role', true)::text,
          'USER'
        );
      EXCEPTION
        WHEN others THEN
          RETURN 'USER';
      END;
      $$ LANGUAGE plpgsql STABLE
         SET search_path = public;
    `);

    // try_parse_uuid is used by the ai_interactions trigger function
    // (sync_ai_interactions_uuid_refs). Harden it as well.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_proc
          WHERE proname = 'try_parse_uuid'
            AND pronamespace = 'public'::regnamespace
        ) THEN
          CREATE OR REPLACE FUNCTION public.try_parse_uuid(value text)
          RETURNS uuid
          LANGUAGE plpgsql
          IMMUTABLE
          SET search_path = public
          AS $fn$
          BEGIN
            IF value IS NULL OR btrim(value) = '' THEN
              RETURN NULL;
            END IF;
            RETURN value::uuid;
          EXCEPTION WHEN invalid_text_representation THEN
            RETURN NULL;
          END;
          $fn$;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore functions without SET search_path (equivalent to pre-193 state).
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.current_company()
      RETURNS uuid AS $$
      BEGIN
        RETURN current_setting('app.current_company_id', true)::uuid;
      EXCEPTION
        WHEN others THEN
          RETURN NULL;
      END;
      $$ LANGUAGE plpgsql STABLE;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.is_super_admin()
      RETURNS boolean AS $$
      BEGIN
        RETURN coalesce(
          current_setting('app.is_super_admin', true)::boolean,
          false
        );
      EXCEPTION
        WHEN others THEN
          RETURN false;
      END;
      $$ LANGUAGE plpgsql STABLE;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.current_user_role()
      RETURNS text AS $$
      BEGIN
        RETURN coalesce(
          current_setting('app.user_role', true)::text,
          'USER'
        );
      EXCEPTION
        WHEN others THEN
          RETURN 'USER';
      END;
      $$ LANGUAGE plpgsql STABLE;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_proc
          WHERE proname = 'try_parse_uuid'
            AND pronamespace = 'public'::regnamespace
        ) THEN
          CREATE OR REPLACE FUNCTION public.try_parse_uuid(value text)
          RETURNS uuid
          LANGUAGE plpgsql
          IMMUTABLE
          AS $fn$
          BEGIN
            IF value IS NULL OR btrim(value) = '' THEN
              RETURN NULL;
            END IF;
            RETURN value::uuid;
          EXCEPTION WHEN invalid_text_representation THEN
            RETURN NULL;
          END;
          $fn$;
        END IF;
      END $$;
    `);
  }
}
