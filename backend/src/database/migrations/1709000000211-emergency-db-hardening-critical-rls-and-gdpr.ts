import { MigrationInterface, QueryRunner } from 'typeorm';

function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

export class EmergencyDbHardeningCriticalRlsAndGdpr1709000000211 implements MigrationInterface {
  name = 'EmergencyDbHardeningCriticalRlsAndGdpr1709000000211';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.ensureDdsSignatureInvitesTable(queryRunner);
    await this.hardenTenantOnboardingInvitesRls(queryRunner);
    await this.hardenOperationalGlobalPolicies(queryRunner);
    await this.replaceGdprCleanupFunctions(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('tenant_onboarding_invites')) {
      await queryRunner.query(
        `DROP POLICY IF EXISTS "tenant_onboarding_invites_super_admin_all" ON "tenant_onboarding_invites"`,
      );
      await queryRunner.query(
        `DROP POLICY IF EXISTS "tenant_onboarding_invites_company_all" ON "tenant_onboarding_invites"`,
      );
      await queryRunner.query(
        `ALTER TABLE "tenant_onboarding_invites" NO FORCE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(
        `ALTER TABLE "tenant_onboarding_invites" DISABLE ROW LEVEL SECURITY`,
      );
    }

    if (await queryRunner.hasTable('disaster_recovery_executions')) {
      await queryRunner.query(
        `DROP POLICY IF EXISTS "rls_operational_global_runtime_access" ON "disaster_recovery_executions"`,
      );
      await queryRunner.query(
        `CREATE POLICY "rls_operational_global_runtime_access" ON "disaster_recovery_executions" FOR ALL USING (true) WITH CHECK (true)`,
      );
    }

    if (await queryRunner.hasTable('gdpr_retention_cleanup_runs')) {
      await queryRunner.query(
        `DROP POLICY IF EXISTS "rls_operational_global_runtime_access" ON "gdpr_retention_cleanup_runs"`,
      );
      await queryRunner.query(
        `CREATE POLICY "rls_operational_global_runtime_access" ON "gdpr_retention_cleanup_runs" FOR ALL USING (true) WITH CHECK (true)`,
      );
    }
  }

  private async ensureDdsSignatureInvitesTable(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "dds_signature_invites" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "company_id" uuid NOT NULL,
        "dds_id" uuid NOT NULL,
        "participant_user_id" uuid NOT NULL,
        "created_by_user_id" uuid,
        "signed_signature_id" uuid,
        "token_hash" character varying(64) NOT NULL,
        "dds_version" integer NOT NULL,
        "expires_at" TIMESTAMP NOT NULL,
        "revoked_at" TIMESTAMP,
        "used_at" TIMESTAMP,
        "last_viewed_at" TIMESTAMP,
        "signed_ip_hash" character varying(64),
        "signed_user_agent_hash" character varying(64),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "dds_signature_invites"
        ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT uuid_generate_v4(),
        ADD COLUMN IF NOT EXISTS "company_id" uuid,
        ADD COLUMN IF NOT EXISTS "dds_id" uuid,
        ADD COLUMN IF NOT EXISTS "participant_user_id" uuid,
        ADD COLUMN IF NOT EXISTS "created_by_user_id" uuid,
        ADD COLUMN IF NOT EXISTS "signed_signature_id" uuid,
        ADD COLUMN IF NOT EXISTS "token_hash" character varying(64),
        ADD COLUMN IF NOT EXISTS "dds_version" integer,
        ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMP,
        ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP DEFAULT now(),
        ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP DEFAULT now()
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass('public.dds_signature_invites') IS NULL THEN
          RETURN;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'PK_dds_signature_invites_id'
            AND conrelid = 'public.dds_signature_invites'::regclass
        ) THEN
          ALTER TABLE "dds_signature_invites"
            ADD CONSTRAINT "PK_dds_signature_invites_id" PRIMARY KEY ("id");
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'UQ_dds_signature_invites_token_hash'
            AND conrelid = 'public.dds_signature_invites'::regclass
        ) THEN
          ALTER TABLE "dds_signature_invites"
            ADD CONSTRAINT "UQ_dds_signature_invites_token_hash" UNIQUE ("token_hash");
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'FK_dds_signature_invites_company_id'
            AND conrelid = 'public.dds_signature_invites'::regclass
        ) THEN
          ALTER TABLE "dds_signature_invites"
            ADD CONSTRAINT "FK_dds_signature_invites_company_id"
            FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'FK_dds_signature_invites_dds_id'
            AND conrelid = 'public.dds_signature_invites'::regclass
        ) THEN
          ALTER TABLE "dds_signature_invites"
            ADD CONSTRAINT "FK_dds_signature_invites_dds_id"
            FOREIGN KEY ("dds_id") REFERENCES "dds"("id") ON DELETE CASCADE;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'FK_dds_signature_invites_participant_user_id'
            AND conrelid = 'public.dds_signature_invites'::regclass
        ) THEN
          ALTER TABLE "dds_signature_invites"
            ADD CONSTRAINT "FK_dds_signature_invites_participant_user_id"
            FOREIGN KEY ("participant_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'FK_dds_signature_invites_created_by_user_id'
            AND conrelid = 'public.dds_signature_invites'::regclass
        ) THEN
          ALTER TABLE "dds_signature_invites"
            ADD CONSTRAINT "FK_dds_signature_invites_created_by_user_id"
            FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'FK_dds_signature_invites_signed_signature_id'
            AND conrelid = 'public.dds_signature_invites'::regclass
        ) THEN
          ALTER TABLE "dds_signature_invites"
            ADD CONSTRAINT "FK_dds_signature_invites_signed_signature_id"
            FOREIGN KEY ("signed_signature_id") REFERENCES "signatures"("id") ON DELETE SET NULL;
        END IF;
      END$$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_dds_signature_invites_company_dds_participant"
      ON "dds_signature_invites" ("company_id", "dds_id", "participant_user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_dds_signature_invites_active"
      ON "dds_signature_invites" ("company_id", "expires_at", "revoked_at", "used_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_dds_signature_invites_dds_id"
      ON "dds_signature_invites" ("dds_id")
    `);

    await queryRunner.query(
      `ALTER TABLE "dds_signature_invites" ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE "dds_signature_invites" FORCE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `DROP POLICY IF EXISTS "tenant_isolation_policy" ON "dds_signature_invites"`,
    );
    await queryRunner.query(`
      CREATE POLICY "tenant_isolation_policy"
      ON "dds_signature_invites"
      FOR ALL
      USING (
        (company_id)::text = (current_company())::text
        OR is_super_admin() = true
      )
      WITH CHECK (
        (company_id)::text = (current_company())::text
        OR is_super_admin() = true
      )
    `);
  }

  private async hardenTenantOnboardingInvitesRls(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tenant_onboarding_invites" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "token_hash" varchar(64) NOT NULL UNIQUE,
        "email" varchar(255) NOT NULL,
        "intended_company_name" varchar(255) NULL,
        "expires_at" timestamptz NOT NULL,
        "used_at" timestamptz NULL,
        "revoked_at" timestamptz NULL,
        "created_by_user_id" uuid NULL,
        "created_company_id" uuid NULL,
        "created_user_id" uuid NULL,
        "metadata" jsonb NULL,
        "created_at" timestamptz DEFAULT now() NOT NULL,
        "updated_at" timestamptz DEFAULT now() NOT NULL,
        CONSTRAINT "FK_tenant_onboarding_invites_created_company"
          FOREIGN KEY ("created_company_id") REFERENCES "companies"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_tenant_onboarding_invites_created_user"
          FOREIGN KEY ("created_user_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "tenant_onboarding_invites"
        ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT uuid_generate_v4(),
        ADD COLUMN IF NOT EXISTS "token_hash" varchar(64),
        ADD COLUMN IF NOT EXISTS "email" varchar(255),
        ADD COLUMN IF NOT EXISTS "intended_company_name" varchar(255),
        ADD COLUMN IF NOT EXISTS "expires_at" timestamptz,
        ADD COLUMN IF NOT EXISTS "used_at" timestamptz,
        ADD COLUMN IF NOT EXISTS "revoked_at" timestamptz,
        ADD COLUMN IF NOT EXISTS "created_by_user_id" uuid,
        ADD COLUMN IF NOT EXISTS "created_company_id" uuid,
        ADD COLUMN IF NOT EXISTS "created_user_id" uuid,
        ADD COLUMN IF NOT EXISTS "metadata" jsonb,
        ADD COLUMN IF NOT EXISTS "created_at" timestamptz DEFAULT now(),
        ADD COLUMN IF NOT EXISTS "updated_at" timestamptz DEFAULT now()
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass('public.tenant_onboarding_invites') IS NULL THEN
          RETURN;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'FK_tenant_onboarding_invites_created_company'
            AND conrelid = 'public.tenant_onboarding_invites'::regclass
        ) THEN
          ALTER TABLE "tenant_onboarding_invites"
            ADD CONSTRAINT "FK_tenant_onboarding_invites_created_company"
            FOREIGN KEY ("created_company_id") REFERENCES "companies"("id") ON DELETE SET NULL;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'FK_tenant_onboarding_invites_created_user'
            AND conrelid = 'public.tenant_onboarding_invites'::regclass
        ) THEN
          ALTER TABLE "tenant_onboarding_invites"
            ADD CONSTRAINT "FK_tenant_onboarding_invites_created_user"
            FOREIGN KEY ("created_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
        END IF;
      END$$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_tenant_onboarding_invites_email"
      ON "tenant_onboarding_invites" ("email")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_tenant_onboarding_invites_expires"
      ON "tenant_onboarding_invites" ("expires_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_tenant_onboarding_invites_company"
      ON "tenant_onboarding_invites" ("created_company_id")
    `);

    await queryRunner.query(
      `ALTER TABLE "tenant_onboarding_invites" ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_onboarding_invites" FORCE ROW LEVEL SECURITY`,
    );

    await queryRunner.query(
      `DROP POLICY IF EXISTS "tenant_onboarding_invites_super_admin_all" ON "tenant_onboarding_invites"`,
    );
    await queryRunner.query(
      `DROP POLICY IF EXISTS "tenant_onboarding_invites_company_all" ON "tenant_onboarding_invites"`,
    );
    await queryRunner.query(
      `DROP POLICY IF EXISTS "tenant_isolation_policy" ON "tenant_onboarding_invites"`,
    );
    await queryRunner.query(`
      CREATE POLICY "tenant_onboarding_invites_super_admin_all"
      ON "tenant_onboarding_invites"
      FOR ALL
      USING (is_super_admin() = true)
      WITH CHECK (is_super_admin() = true)
    `);
    await queryRunner.query(`
      CREATE POLICY "tenant_onboarding_invites_company_all"
      ON "tenant_onboarding_invites"
      FOR ALL
      USING (
        created_company_id IS NOT NULL
        AND (created_company_id)::text = (current_company())::text
      )
      WITH CHECK (
        created_company_id IS NOT NULL
        AND (created_company_id)::text = (current_company())::text
      )
    `);
  }

  private async hardenOperationalGlobalPolicies(
    queryRunner: QueryRunner,
  ): Promise<void> {
    const operationalGlobalTables = [
      'disaster_recovery_executions',
      'gdpr_retention_cleanup_runs',
    ];

    for (const tableName of operationalGlobalTables) {
      if (!(await queryRunner.hasTable(tableName))) {
        continue;
      }

      const table = quoteIdent(tableName);
      await queryRunner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      await queryRunner.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
      await queryRunner.query(
        `DROP POLICY IF EXISTS "rls_operational_global_runtime_access" ON ${table}`,
      );
      await queryRunner.query(`
        CREATE POLICY "rls_operational_global_runtime_access"
        ON ${table}
        FOR ALL
        USING (is_super_admin() = true)
        WITH CHECK (is_super_admin() = true)
      `);
    }
  }

  private async replaceGdprCleanupFunctions(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION cleanup_expired_data()
      RETURNS TABLE(table_name text, deleted_count integer) AS $$
      DECLARE
        v_count INTEGER;
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns cols
          WHERE cols.table_schema = 'public'
            AND cols.table_name = 'mail_logs'
            AND cols.column_name = 'deleted_at'
        ) THEN
          DELETE FROM mail_logs
          WHERE deleted_at IS NOT NULL
            AND deleted_at < NOW() - INTERVAL '90 days';
          GET DIAGNOSTICS v_count = ROW_COUNT;
        ELSE
          v_count := 0;
        END IF;
        RETURN QUERY SELECT 'mail_logs'::text, v_count;

        IF to_regclass('public.user_sessions') IS NOT NULL THEN
          DELETE FROM user_sessions
          WHERE expires_at < NOW() - INTERVAL '30 days';
          GET DIAGNOSTICS v_count = ROW_COUNT;
        ELSE
          v_count := 0;
        END IF;
        RETURN QUERY SELECT 'user_sessions'::text, v_count;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns cols
          WHERE cols.table_schema = 'public'
            AND cols.table_name = 'forensic_trail_events'
            AND cols.column_name = 'occurred_at'
        ) THEN
          DELETE FROM forensic_trail_events
          WHERE occurred_at < NOW() - INTERVAL '2 years';
          GET DIAGNOSTICS v_count = ROW_COUNT;
        ELSIF EXISTS (
          SELECT 1 FROM information_schema.columns cols
          WHERE cols.table_schema = 'public'
            AND cols.table_name = 'forensic_trail_events'
            AND cols.column_name = 'created_at'
        ) THEN
          DELETE FROM forensic_trail_events
          WHERE created_at < NOW() - INTERVAL '2 years';
          GET DIAGNOSTICS v_count = ROW_COUNT;
        ELSE
          v_count := 0;
        END IF;
        RETURN QUERY SELECT 'forensic_trail_events'::text, v_count;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns cols
          WHERE cols.table_schema = 'public'
            AND cols.table_name = 'activities'
            AND cols.column_name = 'deleted_at'
        ) THEN
          DELETE FROM activities
          WHERE deleted_at IS NOT NULL
            AND deleted_at < NOW() - INTERVAL '1 year';
          GET DIAGNOSTICS v_count = ROW_COUNT;
        ELSE
          v_count := 0;
        END IF;
        RETURN QUERY SELECT 'activities'::text, v_count;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns cols
          WHERE cols.table_schema = 'public'
            AND cols.table_name = 'audit_logs'
            AND cols.column_name = 'timestamp'
        ) THEN
          DELETE FROM audit_logs
          WHERE "timestamp" < NOW() - INTERVAL '2 years';
          GET DIAGNOSTICS v_count = ROW_COUNT;
        ELSIF EXISTS (
          SELECT 1 FROM information_schema.columns cols
          WHERE cols.table_schema = 'public'
            AND cols.table_name = 'audit_logs'
            AND cols.column_name = 'created_at'
        ) THEN
          DELETE FROM audit_logs
          WHERE created_at < NOW() - INTERVAL '2 years';
          GET DIAGNOSTICS v_count = ROW_COUNT;
        ELSE
          v_count := 0;
        END IF;
        RETURN QUERY SELECT 'audit_logs'::text, v_count;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns cols
          WHERE cols.table_schema = 'public'
            AND cols.table_name = 'ai_interactions'
            AND cols.column_name = 'deleted_at'
        ) THEN
          DELETE FROM ai_interactions
          WHERE deleted_at IS NOT NULL
            AND deleted_at < NOW() - INTERVAL '1 year';
          GET DIAGNOSTICS v_count = ROW_COUNT;
        ELSE
          v_count := 0;
        END IF;
        RETURN QUERY SELECT 'ai_interactions'::text, v_count;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION gdpr_delete_user_data(p_user_id UUID)
      RETURNS TABLE(table_name text, deleted_count integer) AS $$
      DECLARE
        v_count INTEGER;
      BEGIN
        IF to_regclass('public.activities') IS NOT NULL THEN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns cols
            WHERE cols.table_schema = 'public'
              AND cols.table_name = 'activities'
              AND cols.column_name = 'deleted_at'
          ) THEN
            UPDATE activities
            SET deleted_at = NOW(), user_id = NULL
            WHERE user_id = p_user_id AND deleted_at IS NULL;
          ELSE
            UPDATE activities
            SET user_id = NULL
            WHERE user_id = p_user_id;
          END IF;
          GET DIAGNOSTICS v_count = ROW_COUNT;
        ELSE
          v_count := 0;
        END IF;
        RETURN QUERY SELECT 'activities'::text, v_count;

        IF to_regclass('public.audit_logs') IS NOT NULL THEN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns cols
            WHERE cols.table_schema = 'public'
              AND cols.table_name = 'audit_logs'
              AND cols.column_name = 'deleted_at'
          ) THEN
            UPDATE audit_logs
            SET deleted_at = NOW(), user_id = NULL
            WHERE user_id = p_user_id AND deleted_at IS NULL;
          ELSE
            UPDATE audit_logs
            SET user_id = NULL
            WHERE user_id = p_user_id;
          END IF;
          GET DIAGNOSTICS v_count = ROW_COUNT;
        ELSE
          v_count := 0;
        END IF;
        RETURN QUERY SELECT 'audit_logs'::text, v_count;

        IF to_regclass('public.user_sessions') IS NOT NULL THEN
          DELETE FROM user_sessions
          WHERE user_id = p_user_id;
          GET DIAGNOSTICS v_count = ROW_COUNT;
        ELSE
          v_count := 0;
        END IF;
        RETURN QUERY SELECT 'user_sessions'::text, v_count;

        IF to_regclass('public.document_registry') IS NOT NULL THEN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns cols
            WHERE cols.table_schema = 'public'
              AND cols.table_name = 'document_registry'
              AND cols.column_name = 'deleted_at'
          ) THEN
            UPDATE document_registry
            SET deleted_at = NOW(), created_by = NULL
            WHERE created_by = p_user_id AND deleted_at IS NULL;
          ELSE
            UPDATE document_registry
            SET created_by = NULL
            WHERE created_by = p_user_id;
          END IF;
          GET DIAGNOSTICS v_count = ROW_COUNT;
        ELSE
          v_count := 0;
        END IF;
        RETURN QUERY SELECT 'document_registry'::text, v_count;

        IF to_regclass('public.ai_interactions') IS NOT NULL THEN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns cols
            WHERE cols.table_schema = 'public'
              AND cols.table_name = 'ai_interactions'
              AND cols.column_name = 'deleted_at'
          ) THEN
            UPDATE ai_interactions
            SET deleted_at = NOW(),
                user_id = NULL,
                question = '[LGPD: dado apagado a pedido do titular]',
                response = NULL
            WHERE user_id = p_user_id AND deleted_at IS NULL;
            GET DIAGNOSTICS v_count = ROW_COUNT;
          ELSE
            v_count := 0;
          END IF;
        ELSE
          v_count := 0;
        END IF;
        RETURN QUERY SELECT 'ai_interactions'::text, v_count;

        IF to_regclass('public.user_consents') IS NOT NULL THEN
          UPDATE user_consents
          SET revoked_at = NOW(),
              revoked_ip = 'gdpr-erasure',
              notes = COALESCE(notes || ' | ', '') || 'Revogado por gdpr_delete_user_data()'
          WHERE user_id = p_user_id AND revoked_at IS NULL;
          GET DIAGNOSTICS v_count = ROW_COUNT;
        ELSE
          v_count := 0;
        END IF;
        RETURN QUERY SELECT 'user_consents'::text, v_count;
      END;
      $$ LANGUAGE plpgsql;
    `);
  }
}
