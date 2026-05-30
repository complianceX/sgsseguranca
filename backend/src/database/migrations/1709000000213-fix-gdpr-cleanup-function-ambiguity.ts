import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixGdprCleanupFunctionAmbiguity1709000000213 implements MigrationInterface {
  name = 'FixGdprCleanupFunctionAmbiguity1709000000213';

  public async up(queryRunner: QueryRunner): Promise<void> {
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

  public async down(): Promise<void> {
    // No-op: evitar rollback para uma versao sabidamente quebrada da funcao.
  }
}
