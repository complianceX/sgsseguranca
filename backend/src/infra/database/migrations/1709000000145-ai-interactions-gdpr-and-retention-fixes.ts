import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sprint 3.7/3.8/3.9 — ai_interactions GDPR coverage + audit_logs retention fix.
 *
 * Changes:
 * 1. Add deleted_at to ai_interactions (enables soft-delete by GDPR function and TTL cleanup).
 * 2. Update gdpr_delete_user_data() to anonymize ai_interactions rows for the given user.
 * 3. Update cleanup_expired_data() to hard-delete expired ai_interactions (1-year TTL).
 * 4. Fix audit_logs retention in cleanup_expired_data(): was 1 year, data_retention_policies
 *    says 730 days (2 years) — align the function to match the documented policy.
 * 5. Register ai_interactions retention policy in data_retention_policies.
 */
export class AiInteractionsGdprAndRetentionFixes1709000000145 implements MigrationInterface {
  name = 'AiInteractionsGdprAndRetentionFixes1709000000145';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add deleted_at to ai_interactions
    await queryRunner.query(`
      ALTER TABLE ai_interactions
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_interactions_deleted_at
        ON ai_interactions (deleted_at)
        WHERE deleted_at IS NOT NULL
    `);

    // 2 & 3 & 4. Rebuild both GDPR functions atomically
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION gdpr_delete_user_data(p_user_id UUID)
      RETURNS TABLE(table_name text, deleted_count integer) AS $$
      DECLARE
        v_count INTEGER;
      BEGIN
        -- Activities associadas ao usuário
        UPDATE activities
        SET deleted_at = NOW(), user_id = NULL
        WHERE user_id = p_user_id AND deleted_at IS NULL;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN QUERY SELECT 'activities'::text, v_count;

        -- Audit logs do usuário
        UPDATE audit_logs
        SET deleted_at = NOW(), user_id = NULL
        WHERE user_id = p_user_id AND deleted_at IS NULL;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN QUERY SELECT 'audit_logs'::text, v_count;

        -- Sessions do usuário
        DELETE FROM user_sessions
        WHERE user_id = p_user_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN QUERY SELECT 'user_sessions'::text, v_count;

        -- Documentos (manter com created_by_id = NULL para audit)
        UPDATE document_registry
        SET deleted_at = NOW(), created_by_id = NULL
        WHERE created_by_id = p_user_id AND deleted_at IS NULL;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN QUERY SELECT 'document_registry'::text, v_count;

        -- AI interactions: anonimizar pergunta e resposta, desvincular do usuário
        UPDATE ai_interactions
        SET deleted_at = NOW(),
            user_id   = NULL,
            question  = '[LGPD: dado apagado a pedido do titular]',
            response  = NULL
        WHERE user_id = p_user_id AND deleted_at IS NULL;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN QUERY SELECT 'ai_interactions'::text, v_count;

        -- Consentimentos do usuário (revogar sem apagar a prova)
        UPDATE user_consents
        SET revoked_at = NOW(),
            revoked_ip = 'gdpr-erasure',
            notes = COALESCE(notes || ' | ', '') || 'Revogado por gdpr_delete_user_data()'
        WHERE user_id = p_user_id AND revoked_at IS NULL;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN QUERY SELECT 'user_consents'::text, v_count;
      END;
      $$ LANGUAGE plpgsql;

      COMMENT ON FUNCTION gdpr_delete_user_data(UUID) IS
        'LGPD Art. 18 VI — anonimiza todos os dados do titular: activities, audit_logs, sessions, documents, ai_interactions, consents.';
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION cleanup_expired_data()
      RETURNS TABLE(table_name text, deleted_count integer) AS $$
      DECLARE
        v_count INTEGER;
      BEGIN
        -- Mail logs (90 dias)
        DELETE FROM mail_logs
        WHERE deleted_at IS NOT NULL
          AND deleted_at < NOW() - INTERVAL '90 days';
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN QUERY SELECT 'mail_logs'::text, v_count;

        -- User sessions (30 dias expiradas)
        DELETE FROM user_sessions
        WHERE expires_at < NOW() - INTERVAL '30 days';
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN QUERY SELECT 'user_sessions'::text, v_count;

        -- Forensic trail (2 anos)
        DELETE FROM forensic_trail_events
        WHERE deleted_at IS NOT NULL
          AND deleted_at < NOW() - INTERVAL '2 years';
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN QUERY SELECT 'forensic_trail_events'::text, v_count;

        -- Activities (1 ano)
        DELETE FROM activities
        WHERE deleted_at IS NOT NULL
          AND deleted_at < NOW() - INTERVAL '1 year';
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN QUERY SELECT 'activities'::text, v_count;

        -- Audit logs (2 anos — alinhado com data_retention_policies.retention_days = 730)
        DELETE FROM audit_logs
        WHERE deleted_at IS NOT NULL
          AND deleted_at < NOW() - INTERVAL '2 years';
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN QUERY SELECT 'audit_logs'::text, v_count;

        -- AI interactions anonimizadas (1 ano após anonimização por GDPR)
        DELETE FROM ai_interactions
        WHERE deleted_at IS NOT NULL
          AND deleted_at < NOW() - INTERVAL '1 year';
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN QUERY SELECT 'ai_interactions'::text, v_count;
      END;
      $$ LANGUAGE plpgsql;

      COMMENT ON FUNCTION cleanup_expired_data() IS
        'Hard-delete de dados expirados conforme data_retention_policies. audit_logs: 2 anos; ai_interactions: 1 ano pós-anonimização.';
    `);

    // 5. Register ai_interactions and fix audit_logs retention record
    await queryRunner.query(`
      INSERT INTO data_retention_policies
        (table_name, retention_days, retention_reason, hard_delete, soft_delete_only)
      VALUES
        ('ai_interactions', 365, 'AI interaction logs — hard-delete 1 year after GDPR anonymisation', true, false)
      ON CONFLICT (table_name) DO UPDATE SET
        retention_days   = 365,
        retention_reason = 'AI interaction logs — hard-delete 1 year after GDPR anonymisation',
        updated_at       = NOW()
    `);

    // Fix audit_logs entry to match the 2-year (730 days) cleanup_expired_data interval
    await queryRunner.query(`
      UPDATE data_retention_policies
      SET retention_days = 730,
          retention_reason = 'LGPD audit trail — 2-year requirement (alinhado com cleanup_expired_data)',
          updated_at = NOW()
      WHERE table_name = 'audit_logs'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM data_retention_policies WHERE table_name = 'ai_interactions'`,
    );

    // Restore previous gdpr_delete_user_data (without ai_interactions / user_consents)
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION gdpr_delete_user_data(p_user_id UUID)
      RETURNS TABLE(table_name text, deleted_count integer) AS $$
      DECLARE
        v_count INTEGER;
      BEGIN
        UPDATE activities SET deleted_at = NOW(), user_id = NULL
        WHERE user_id = p_user_id AND deleted_at IS NULL;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN QUERY SELECT 'activities'::text, v_count;

        UPDATE audit_logs SET deleted_at = NOW(), user_id = NULL
        WHERE user_id = p_user_id AND deleted_at IS NULL;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN QUERY SELECT 'audit_logs'::text, v_count;

        DELETE FROM user_sessions WHERE user_id = p_user_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN QUERY SELECT 'user_sessions'::text, v_count;

        UPDATE document_registry SET deleted_at = NOW(), created_by_id = NULL
        WHERE created_by_id = p_user_id AND deleted_at IS NULL;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN QUERY SELECT 'document_registry'::text, v_count;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Restore cleanup_expired_data with old 1-year audit_logs (original behaviour)
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION cleanup_expired_data()
      RETURNS TABLE(table_name text, deleted_count integer) AS $$
      DECLARE
        v_count INTEGER;
      BEGIN
        DELETE FROM mail_logs WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '90 days';
        GET DIAGNOSTICS v_count = ROW_COUNT; RETURN QUERY SELECT 'mail_logs'::text, v_count;

        DELETE FROM user_sessions WHERE expires_at < NOW() - INTERVAL '30 days';
        GET DIAGNOSTICS v_count = ROW_COUNT; RETURN QUERY SELECT 'user_sessions'::text, v_count;

        DELETE FROM forensic_trail_events WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '2 years';
        GET DIAGNOSTICS v_count = ROW_COUNT; RETURN QUERY SELECT 'forensic_trail_events'::text, v_count;

        DELETE FROM activities WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '1 year';
        GET DIAGNOSTICS v_count = ROW_COUNT; RETURN QUERY SELECT 'activities'::text, v_count;

        DELETE FROM audit_logs WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '1 year';
        GET DIAGNOSTICS v_count = ROW_COUNT; RETURN QUERY SELECT 'audit_logs'::text, v_count;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_ai_interactions_deleted_at`,
    );
    await queryRunner.query(`
      ALTER TABLE ai_interactions DROP COLUMN IF EXISTS deleted_at
    `);
  }
}
