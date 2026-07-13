import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * LGPD Art. 18, VI — direito de eliminação. Correção de DOIS defeitos graves.
 *
 * ─── DEFEITO 1: a função estava QUEBRADA e nunca apagou nada ───────────────
 * `gdpr_delete_user_data()` referenciava colunas inexistentes:
 *   - `activities.user_id`         → a tabela não tem essa coluna
 *   - `document_registry.created_by_id` → o nome real é `created_by`
 *   - `audit_logs.deleted_at`      → a tabela não tem soft-delete
 *   - `user_consents.deleted_at`   → idem
 * O primeiro UPDATE já lançava `column "user_id" does not exist`, abortando a
 * função inteira. TODO pedido de exclusão do titular sempre falhou — e o
 * serviço marcava a requisição como "failed" sem que ninguém percebesse.
 *
 * ─── DEFEITO 2: a PII do titular nunca era alvo ────────────────────────────
 * Mesmo se a função funcionasse, ela jamais tocava a tabela `users` — onde
 * ficam o CPF (claro, hash e ciphertext), o nome e o e-mail. O dado pessoal
 * mais sensível permaneceria intacto.
 *
 * ─── ABORDAGEM ────────────────────────────────────────────────────────────
 * A linha de `users` NÃO é deletada: ela é referenciada por assinaturas,
 * aprovações e trilha forense de documentos já emitidos (APR, PT, DDS...), que
 * têm base legal própria de retenção (obrigação legal de SST — LGPD Art. 7º,
 * II e Art. 16, I). Apagá-la destruiria a integridade probatória desses
 * documentos. O correto é ANONIMIZAR: os identificadores diretos são
 * eliminados irreversivelmente e o vínculo documental permanece íntegro, sem
 * apontar para pessoa natural identificável (LGPD Art. 12).
 *
 * Todas as referências de coluna abaixo foram verificadas contra o schema real.
 * `SET search_path = public` preservado (hardening das migrations 193/340).
 */
export class GdprAnonymizeUserPii1709000000345 implements MigrationInterface {
  name = 'GdprAnonymizeUserPii1709000000345';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.gdpr_delete_user_data(p_user_id uuid)
      RETURNS TABLE(table_name text, deleted_count integer)
      LANGUAGE plpgsql
      SET search_path TO 'public'
      AS $function$
      DECLARE
        v_count INTEGER;
      BEGIN
        -- NOTA: 'activities' foi removida — a tabela não possui vínculo com
        -- usuário (sem coluna user_id). A referência anterior era fantasma e
        -- abortava a função inteira no primeiro UPDATE.

        -- Audit logs: desvincular do titular e apagar rastros de rede.
        -- A tabela não tem deleted_at — o registro de auditoria é MANTIDO
        -- (obrigação legal de trilha), porém anonimizado.
        -- A coluna userId é varchar (legada) e exige cast; ip é NOT NULL e
        -- recebe placeholder em vez de NULL.
        UPDATE audit_logs
        SET user_id     = NULL,
            "userId"    = NULL,
            ip          = '[LGPD: anonimizado]',
            "userAgent" = NULL
        WHERE user_id = p_user_id OR "userId" = p_user_id::text;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN QUERY SELECT 'audit_logs'::text, v_count;

        -- Sessões do titular: eliminação completa.
        DELETE FROM user_sessions
        WHERE user_id = p_user_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN QUERY SELECT 'user_sessions'::text, v_count;

        -- Registro governado de documentos: desvincular o autor.
        -- O documento em si é PRESERVADO (retenção legal SST); apenas deixa
        -- de apontar para o titular. Coluna correta: created_by (não
        -- created_by_id), e a tabela não sofre soft-delete aqui — apagar o
        -- registro governado destruiria a prova documental.
        UPDATE document_registry
        SET created_by = NULL
        WHERE created_by = p_user_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN QUERY SELECT 'document_registry'::text, v_count;

        -- Interações de IA: anonimizar conteúdo e desvincular.
        -- Aqui user_id é varchar NOT NULL e recebe placeholder (não NULL).
        UPDATE ai_interactions
        SET deleted_at = NOW(),
            user_id    = '[LGPD: anonimizado]',
            question   = '[LGPD: dado apagado a pedido do titular]',
            response   = NULL
        WHERE user_id = p_user_id::text AND deleted_at IS NULL;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN QUERY SELECT 'ai_interactions'::text, v_count;

        -- Consentimentos: revogar preservando a prova histórica
        -- (event-sourced — a linha do aceite não é apagada).
        UPDATE user_consents
        SET revoked_at = NOW(),
            revoked_ip = 'gdpr-erasure',
            notes = COALESCE(notes || ' | ', '') || 'Revogado por gdpr_delete_user_data()'
        WHERE user_id = p_user_id AND revoked_at IS NULL;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN QUERY SELECT 'user_consents'::text, v_count;

        -- Evidências fotográficas de APR: apagar PII de captura
        -- (autor, IP, dispositivo e geolocalização).
        UPDATE apr_risk_evidences
        SET uploaded_by_id = NULL,
            ip_address     = NULL,
            device_id      = NULL,
            latitude       = NULL,
            longitude      = NULL
        WHERE uploaded_by_id = p_user_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN QUERY SELECT 'apr_risk_evidences'::text, v_count;

        -- ─────────────────────────────────────────────────────────────────
        -- users: ANONIMIZAÇÃO DOS IDENTIFICADORES DIRETOS DO TITULAR.
        --
        -- A linha é preservada (FKs de assinaturas/aprovações de documentos
        -- com retenção legal própria), mas deixa de identificar pessoa
        -- natural: CPF (claro, hash e ciphertext), nome, e-mail e função são
        -- eliminados irreversivelmente. Credenciais zeradas, acesso revogado.
        --
        -- access_status = 'no_login' respeita CHK_users_access_status
        -- (aceitos: credentialed | no_login | missing_credentials).
        -- ─────────────────────────────────────────────────────────────────
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
    // Restaura a definição anterior (quebrada — referencia colunas
    // inexistentes e não anonimiza `users`). Mantida apenas para
    // reversibilidade formal da migration.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.gdpr_delete_user_data(p_user_id uuid)
      RETURNS TABLE(table_name text, deleted_count integer)
      LANGUAGE plpgsql
      SET search_path TO 'public'
      AS $function$
      DECLARE
        v_count INTEGER;
      BEGIN
        UPDATE activities
        SET deleted_at = NOW(), user_id = NULL
        WHERE user_id = p_user_id AND deleted_at IS NULL;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN QUERY SELECT 'activities'::text, v_count;

        UPDATE audit_logs
        SET deleted_at = NOW(), user_id = NULL
        WHERE user_id = p_user_id AND deleted_at IS NULL;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN QUERY SELECT 'audit_logs'::text, v_count;

        DELETE FROM user_sessions
        WHERE user_id = p_user_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN QUERY SELECT 'user_sessions'::text, v_count;

        UPDATE document_registry
        SET deleted_at = NOW(), created_by_id = NULL
        WHERE created_by_id = p_user_id AND deleted_at IS NULL;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN QUERY SELECT 'document_registry'::text, v_count;

        UPDATE ai_interactions
        SET deleted_at = NOW(),
            user_id   = NULL,
            question  = '[LGPD: dado apagado a pedido do titular]',
            response  = NULL
        WHERE user_id = p_user_id AND deleted_at IS NULL;
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
      END;
      $function$;
    `);
  }
}
