import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Restaura epi_assignments e pts_text_fields em gdpr_delete_user_data().
 *
 * A migration 345 reescreveu a função e perdeu as duas tabelas adicionadas
 * pelas migrations 312 (pts_text_fields) e 314 (epi_assignments). Esta
 * migration faz CREATE OR REPLACE com a função completa, consolidando todas
 * as tabelas: o corpo da 345 + os dois blocos ausentes.
 *
 * Também anonimiza o campo signed_on_behalf_of_user_id (adicionado em 2026-08)
 * no JSONB de assinatura de EPI.
 */
export class RestoreGdprEpiPtsErasure1709000000378 implements MigrationInterface {
  name = 'RestoreGdprEpiPtsErasure1709000000378';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (
      queryRunner.connection.options.type === 'sqlite' ||
      queryRunner.connection.options.type === 'better-sqlite3'
    ) {
      return;
    }

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.gdpr_delete_user_data(p_user_id uuid)
      RETURNS TABLE(table_name text, deleted_count integer)
      LANGUAGE plpgsql
      SET search_path TO 'public'
      AS $function$
      DECLARE
        v_count INTEGER;
      BEGIN
        -- Audit logs: desvincular do titular e apagar rastros de rede.
        UPDATE audit_logs
        SET user_id     = NULL,
            "userId"    = NULL,
            ip          = '[LGPD: anonimizado]',
            "userAgent" = NULL
        WHERE user_id = p_user_id OR "userId" = p_user_id::text;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN QUERY SELECT 'audit_logs'::text, v_count;

        -- Sessões do titular: eliminação completa.
        DELETE FROM user_sessions WHERE user_id = p_user_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN QUERY SELECT 'user_sessions'::text, v_count;

        -- Registro governado de documentos: desvincular o autor.
        UPDATE document_registry
        SET created_by = NULL
        WHERE created_by = p_user_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN QUERY SELECT 'document_registry'::text, v_count;

        -- Interações de IA: anonimizar conteúdo e desvincular.
        UPDATE ai_interactions
        SET deleted_at = NOW(),
            user_id    = '[LGPD: anonimizado]',
            question   = '[LGPD: dado apagado a pedido do titular]',
            response   = NULL
        WHERE user_id = p_user_id::text AND deleted_at IS NULL;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN QUERY SELECT 'ai_interactions'::text, v_count;

        -- Consentimentos: revogar preservando a prova histórica.
        UPDATE user_consents
        SET revoked_at = NOW(),
            revoked_ip = 'gdpr-erasure',
            notes = COALESCE(notes || ' | ', '') || 'Revogado por gdpr_delete_user_data()'
        WHERE user_id = p_user_id AND revoked_at IS NULL;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN QUERY SELECT 'user_consents'::text, v_count;

        -- Evidências fotográficas de APR: apagar PII de captura.
        UPDATE apr_risk_evidences
        SET uploaded_by_id = NULL,
            ip_address     = NULL,
            device_id      = NULL,
            latitude       = NULL,
            longitude      = NULL
        WHERE uploaded_by_id = p_user_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN QUERY SELECT 'apr_risk_evidences'::text, v_count;

        -- Campos de texto livre de PTs: anonimizar motivos de aprovação/reprovação.
        -- Restaurado: foi perdido pela migration 345.
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
        RETURN QUERY SELECT 'pts_text_fields'::text, v_count;

        -- Fichas de EPI: soft-delete + anonimizar assinatura/biometria.
        -- Restaurado: foi perdido pela migration 345.
        -- Inclui signed_on_behalf_of_user_id (adicionado em 2026-08).
        UPDATE epi_assignments
        SET deleted_at = NOW(),
            user_id = NULL,
            assinatura_entrega = assinatura_entrega
              - 'signed_on_behalf_of_user_id'
              || jsonb_build_object(
                   'signer_name',    '[LGPD: removido]',
                   'signature_data', '[LGPD: removido]'
                 ),
            assinatura_devolucao = CASE
              WHEN assinatura_devolucao IS NOT NULL THEN
                assinatura_devolucao
                  - 'signed_on_behalf_of_user_id'
                  || jsonb_build_object(
                       'signer_name',    '[LGPD: removido]',
                       'signature_data', '[LGPD: removido]'
                     )
              ELSE assinatura_devolucao
            END
        WHERE user_id = p_user_id AND deleted_at IS NULL;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN QUERY SELECT 'epi_assignments'::text, v_count;

        -- users: anonimização dos identificadores diretos do titular.
        UPDATE users
        SET nome                  = '[LGPD: titular excluído]',
            cpf                   = NULL,
            cpf_hash              = NULL,
            cpf_ciphertext        = NULL,
            email                 = NULL,
            funcao                = NULL,
            password              = NULL,
            signature_pin_hash    = NULL,
            signature_pin_salt    = NULL,
            ai_processing_consent = false,
            status                = false,
            access_status         = 'no_login',
            module_access_keys    = '{}'::jsonb,
            deleted_at            = COALESCE(deleted_at, NOW()),
            updated_at            = NOW()
        WHERE id = p_user_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN QUERY SELECT 'users'::text, v_count;
      END;
      $function$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (
      queryRunner.connection.options.type === 'sqlite' ||
      queryRunner.connection.options.type === 'better-sqlite3'
    ) {
      return;
    }

    // Restaura a versão da migration 345 (sem epi_assignments e pts_text_fields).
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.gdpr_delete_user_data(p_user_id uuid)
      RETURNS TABLE(table_name text, deleted_count integer)
      LANGUAGE plpgsql
      SET search_path TO 'public'
      AS $function$
      DECLARE
        v_count INTEGER;
      BEGIN
        UPDATE audit_logs
        SET user_id     = NULL,
            "userId"    = NULL,
            ip          = '[LGPD: anonimizado]',
            "userAgent" = NULL
        WHERE user_id = p_user_id OR "userId" = p_user_id::text;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN QUERY SELECT 'audit_logs'::text, v_count;

        DELETE FROM user_sessions WHERE user_id = p_user_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN QUERY SELECT 'user_sessions'::text, v_count;

        UPDATE document_registry
        SET created_by = NULL
        WHERE created_by = p_user_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN QUERY SELECT 'document_registry'::text, v_count;

        UPDATE ai_interactions
        SET deleted_at = NOW(),
            user_id    = '[LGPD: anonimizado]',
            question   = '[LGPD: dado apagado a pedido do titular]',
            response   = NULL
        WHERE user_id = p_user_id::text AND deleted_at IS NULL;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN QUERY SELECT 'ai_interactions'::text, v_count;

        UPDATE user_consents
        SET revoked_at = NOW(),
            revoked_ip = 'gdpr-erasure',
            notes = COALESCE(notes || ' | ', '') || 'Revogado por gdpr_delete_user_data()'
        WHERE user_id = p_user_id AND revoked_at IS NULL;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN QUERY SELECT 'user_consents'::text, v_count;

        UPDATE apr_risk_evidences
        SET uploaded_by_id = NULL,
            ip_address     = NULL,
            device_id      = NULL,
            latitude       = NULL,
            longitude      = NULL
        WHERE uploaded_by_id = p_user_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN QUERY SELECT 'apr_risk_evidences'::text, v_count;

        UPDATE users
        SET nome                  = '[LGPD: titular excluído]',
            cpf                   = NULL,
            cpf_hash              = NULL,
            cpf_ciphertext        = NULL,
            email                 = NULL,
            funcao                = NULL,
            password              = NULL,
            signature_pin_hash    = NULL,
            signature_pin_salt    = NULL,
            ai_processing_consent = false,
            status                = false,
            access_status         = 'no_login',
            module_access_keys    = '{}'::jsonb,
            deleted_at            = COALESCE(deleted_at, NOW()),
            updated_at            = NOW()
        WHERE id = p_user_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN QUERY SELECT 'users'::text, v_count;
      END;
      $function$;
    `);
  }
}
