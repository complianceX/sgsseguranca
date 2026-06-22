import { MigrationInterface, QueryRunner } from 'typeorm';

const isSqlite = (qr: QueryRunner) =>
  qr.connection.options.type === 'sqlite' ||
  qr.connection.options.type === 'better-sqlite3';

export class HardenTriggerFunctionsSearchPath1709000000311 implements MigrationInterface {
  name = 'HardenTriggerFunctionsSearchPath1709000000311';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (isSqlite(queryRunner)) {
      return;
    }

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.sync_ai_interactions_uuid_refs()
      RETURNS trigger
      LANGUAGE plpgsql
      SET search_path = public
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

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.sync_notifications_company_id()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SET search_path = public
      AS $$
      BEGIN
        SELECT "company_id"
          INTO NEW."company_id"
        FROM "users"
        WHERE "id"::text = NEW."userId";

        IF NEW."company_id" IS NULL THEN
          RAISE EXCEPTION
            'notifications.company_id could not be resolved for user %',
            NEW."userId";
        END IF;

        RETURN NEW;
      END;
      $$;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.update_updated_at_column()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SET search_path = public
      AS $$
      BEGIN
        IF (TG_OP = 'DELETE') THEN
          NEW.updated_at = NOW();
          RETURN NEW;
        ELSIF (TG_OP = 'UPDATE') THEN
          NEW.updated_at = NOW();
          RETURN NEW;
        ELSIF (TG_OP = 'INSERT') THEN
          NEW.updated_at = COALESCE(NEW.updated_at, NOW());
          RETURN NEW;
        END IF;
        RETURN NEW;
      END;
      $$;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.soft_delete_preserve_row()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SET search_path = public
      AS $$
      BEGIN
        EXECUTE format(
          'UPDATE %I SET deleted_at = NOW() WHERE id = $1',
          TG_TABLE_NAME
        ) USING OLD.id;
        RETURN NULL;
      END;
      $$;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.nullify_apr_legacy_risk_items()
      RETURNS trigger
      LANGUAGE plpgsql
      SET search_path = public
      AS $$
      BEGIN
        NEW.itens_risco := NULL;
        RETURN NEW;
      END;
      $$;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.prevent_forensic_trail_mutation()
      RETURNS trigger
      LANGUAGE plpgsql
      SET search_path = public
      AS $$
      BEGIN
        RAISE EXCEPTION 'forensic_trail_events is append-only';
      END;
      $$;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.check_session_expiry()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SET search_path = public
      AS $$
      BEGIN
        IF NEW.expires_at < NOW() THEN
          NEW.expires_at = NOW() - INTERVAL '1 second';
        END IF;
        RETURN NEW;
      END;
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (isSqlite(queryRunner)) return;

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

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.sync_notifications_company_id()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      BEGIN
        SELECT "company_id"
          INTO NEW."company_id"
        FROM "users"
        WHERE "id"::text = NEW."userId";

        IF NEW."company_id" IS NULL THEN
          RAISE EXCEPTION
            'notifications.company_id could not be resolved for user %',
            NEW."userId";
        END IF;

        RETURN NEW;
      END;
      $$;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.update_updated_at_column()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF (TG_OP = 'DELETE') THEN
          NEW.updated_at = NOW();
          RETURN NEW;
        ELSIF (TG_OP = 'UPDATE') THEN
          NEW.updated_at = NOW();
          RETURN NEW;
        ELSIF (TG_OP = 'INSERT') THEN
          NEW.updated_at = COALESCE(NEW.updated_at, NOW());
          RETURN NEW;
        END IF;
        RETURN NEW;
      END;
      $$;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.soft_delete_preserve_row()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      BEGIN
        EXECUTE format(
          'UPDATE %I SET deleted_at = NOW() WHERE id = $1',
          TG_TABLE_NAME
        ) USING OLD.id;
        RETURN NULL;
      END;
      $$;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.nullify_apr_legacy_risk_items()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        NEW.itens_risco := NULL;
        RETURN NEW;
      END;
      $$;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.prevent_forensic_trail_mutation()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RAISE EXCEPTION 'forensic_trail_events is append-only';
      END;
      $$;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.check_session_expiry()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF NEW.expires_at < NOW() THEN
          NEW.expires_at = NOW() - INTERVAL '1 second';
        END IF;
        RETURN NEW;
      END;
      $$;
    `);
  }
}
