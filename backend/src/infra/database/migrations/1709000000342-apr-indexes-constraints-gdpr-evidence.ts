import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * APR production hardening — three concerns:
 *
 * 1. GDPR erasure: gdpr_delete_user_data() now anonymizes apr_risk_evidences
 *    (uploaded_by_id, ip_address, device_id, latitude, longitude) for the
 *    requesting user. LGPD Art. 18 VI compliance.
 *
 * 2. Junction table indexes: adds missing indexes on the non-owner side of
 *    the six APR many-to-many relations so reverse lookups are efficient.
 *
 * 3. Data integrity constraints:
 *    - apr_approval_records.aprId → aprs.id FK (ON DELETE CASCADE)
 *    - aprs.versao CHECK >= 1
 *    - apr_workflow_configs: CHECK tenant_id IS NOT NULL OR site_id IS NULL
 *      (prevents a global config from being scoped to a specific site)
 */

export class AprIndexesConstraintsGdprEvidence1709000000342 implements MigrationInterface {
  public transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. GDPR: extend gdpr_delete_user_data to cover apr_risk_evidences ─────
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION gdpr_delete_user_data(p_user_id UUID)
      RETURNS TABLE(table_name text, deleted_count integer)
      SET search_path = public
      AS $$
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

        -- Evidências de risco da APR: anonimizar PII do titular (LGPD Art. 18 VI)
        UPDATE apr_risk_evidences
        SET uploaded_by_id = NULL,
            ip_address     = NULL,
            device_id      = NULL,
            latitude       = NULL,
            longitude      = NULL
        WHERE uploaded_by_id = p_user_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN QUERY SELECT 'apr_risk_evidences'::text, v_count;
      END;
      $$ LANGUAGE plpgsql;

      COMMENT ON FUNCTION gdpr_delete_user_data(UUID) IS
        'LGPD Art. 18 VI — anonimiza todos os dados do titular: activities, audit_logs, sessions, documents, ai_interactions, consents, apr_risk_evidences.';
    `);

    // ── 2. Junction table indexes (non-owner side) ─────────────────────────────
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_apr_activities_activity_id"
        ON "apr_activities" ("activity_id");
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_apr_risks_risk_id"
        ON "apr_risks" ("risk_id");
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_apr_epis_epi_id"
        ON "apr_epis" ("epi_id");
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_apr_tools_tool_id"
        ON "apr_tools" ("tool_id");
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_apr_machines_machine_id"
        ON "apr_machines" ("machine_id");
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_apr_participants_user_id"
        ON "apr_participants" ("user_id");
    `);

    // ── 3. apr_approval_records: FK to aprs ───────────────────────────────────
    // Only add if the FK does not already exist
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_apr_approval_records_apr_id'
            AND table_name = 'apr_approval_records'
        ) THEN
          ALTER TABLE "apr_approval_records"
            ADD CONSTRAINT "FK_apr_approval_records_apr_id"
            FOREIGN KEY ("aprId") REFERENCES "aprs"("id") ON DELETE CASCADE;
        END IF;
      END;
      $$;
    `);

    // ── 4. aprs.versao CHECK >= 1 ──────────────────────────────────────────────
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.check_constraints
          WHERE constraint_name = 'CHK_aprs_versao_positive'
        ) THEN
          ALTER TABLE "aprs"
            ADD CONSTRAINT "CHK_aprs_versao_positive" CHECK ("versao" >= 1);
        END IF;
      END;
      $$;
    `);

    // ── 5. apr_workflow_configs: prevent global config scoped to a site ────────
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.check_constraints
          WHERE constraint_name = 'CHK_apr_workflow_config_global_no_site'
        ) THEN
          ALTER TABLE "apr_workflow_configs"
            ADD CONSTRAINT "CHK_apr_workflow_config_global_no_site"
            CHECK ("tenantId" IS NOT NULL OR "siteId" IS NULL);
        END IF;
      END;
      $$;
    `);

    // ── 6. apr_approval_records: index on occurredAt for temporal queries ──────
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_apr_approval_records_occurred_at"
        ON "apr_approval_records" ("occurredAt");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_apr_approval_records_occurred_at"`,
    );
    await queryRunner.query(`
      ALTER TABLE "apr_workflow_configs"
        DROP CONSTRAINT IF EXISTS "CHK_apr_workflow_config_global_no_site"
    `);
    await queryRunner.query(`
      ALTER TABLE "aprs"
        DROP CONSTRAINT IF EXISTS "CHK_aprs_versao_positive"
    `);
    await queryRunner.query(`
      ALTER TABLE "apr_approval_records"
        DROP CONSTRAINT IF EXISTS "FK_apr_approval_records_apr_id"
    `);
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_apr_participants_user_id"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_apr_machines_machine_id"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_apr_tools_tool_id"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_apr_epis_epi_id"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_apr_risks_risk_id"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "IDX_apr_activities_activity_id"`,
    );

    // Restore gdpr_delete_user_data without apr_risk_evidences block
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION gdpr_delete_user_data(p_user_id UUID)
      RETURNS TABLE(table_name text, deleted_count integer)
      SET search_path = public
      AS $$
      DECLARE
        v_count INTEGER;
      BEGIN
        UPDATE activities SET deleted_at = NOW(), user_id = NULL WHERE user_id = p_user_id AND deleted_at IS NULL;
        GET DIAGNOSTICS v_count = ROW_COUNT; RETURN QUERY SELECT 'activities'::text, v_count;
        UPDATE audit_logs SET deleted_at = NOW(), user_id = NULL WHERE user_id = p_user_id AND deleted_at IS NULL;
        GET DIAGNOSTICS v_count = ROW_COUNT; RETURN QUERY SELECT 'audit_logs'::text, v_count;
        DELETE FROM user_sessions WHERE user_id = p_user_id;
        GET DIAGNOSTICS v_count = ROW_COUNT; RETURN QUERY SELECT 'user_sessions'::text, v_count;
        UPDATE document_registry SET deleted_at = NOW(), created_by_id = NULL WHERE created_by_id = p_user_id AND deleted_at IS NULL;
        GET DIAGNOSTICS v_count = ROW_COUNT; RETURN QUERY SELECT 'document_registry'::text, v_count;
        UPDATE ai_interactions SET deleted_at = NOW(), user_id = NULL, question = '[LGPD: dado apagado a pedido do titular]', response = NULL WHERE user_id = p_user_id AND deleted_at IS NULL;
        GET DIAGNOSTICS v_count = ROW_COUNT; RETURN QUERY SELECT 'ai_interactions'::text, v_count;
        UPDATE user_consents SET revoked_at = NOW(), revoked_ip = 'gdpr-erasure', notes = COALESCE(notes || ' | ', '') || 'Revogado por gdpr_delete_user_data()' WHERE user_id = p_user_id AND revoked_at IS NULL;
        GET DIAGNOSTICS v_count = ROW_COUNT; RETURN QUERY SELECT 'user_consents'::text, v_count;
      END;
      $$ LANGUAGE plpgsql;
    `);
  }
}
