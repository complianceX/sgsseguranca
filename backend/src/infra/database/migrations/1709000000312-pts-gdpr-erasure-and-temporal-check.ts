import { MigrationInterface, QueryRunner } from 'typeorm';

const isSqlite = (qr: QueryRunner) =>
  qr.connection.options.type === 'sqlite' ||
  qr.connection.options.type === 'better-sqlite3';

export class PtsGdprErasureAndTemporalCheck1709000000312 implements MigrationInterface {
  name = 'PtsGdprErasureAndTemporalCheck1709000000312';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (isSqlite(queryRunner)) {
      return;
    }

    // CHECK NOT VALID: não revalida linhas existentes — evita lock em tabela com dados
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'CHK_pts_data_hora_validas'
        ) THEN
          ALTER TABLE "pts" ADD CONSTRAINT "CHK_pts_data_hora_validas"
            CHECK ("data_hora_fim" > "data_hora_inicio") NOT VALID;
        END IF;
      END $$;
    `);

    // Atualiza gdpr_delete_user_data para anonimizar campos de texto livre de pts
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.gdpr_delete_user_data(p_user_id UUID)
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

        -- Anonimiza campos de texto livre em pts associadas ao titular
        IF to_regclass('public.pts') IS NOT NULL THEN
          UPDATE pts
          SET
            aprovado_motivo = CASE
              WHEN aprovado_por_id = p_user_id THEN '[anonimizado-LGPD]'
              ELSE aprovado_motivo
            END,
            reprovado_motivo = CASE
              WHEN reprovado_por_id = p_user_id THEN '[anonimizado-LGPD]'
              ELSE reprovado_motivo
            END
          WHERE (aprovado_por_id = p_user_id OR reprovado_por_id = p_user_id)
            AND deleted_at IS NULL;
          GET DIAGNOSTICS v_count = ROW_COUNT;
        ELSE
          v_count := 0;
        END IF;
        RETURN QUERY SELECT 'pts_text_fields'::text, v_count;
      END;
      $$ LANGUAGE plpgsql SET search_path = public;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (isSqlite(queryRunner)) {
      return;
    }
    await queryRunner.query(
      `ALTER TABLE "pts" DROP CONSTRAINT IF EXISTS "CHK_pts_data_hora_validas"`,
    );
    // Não há rollback da função GDPR — a versão anterior foi substituída via CREATE OR REPLACE
  }
}
