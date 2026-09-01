import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adiciona somente metadados não secretos para selecionar a chave de
 * verificação. Tokens e linhas históricas permanecem inalterados e NULL
 * significa que o registro depende do contrato legado v1.
 *
 * A função versionada é separada da função pública histórica para que clientes
 * SQL existentes mantenham o mesmo contrato durante a adoção coordenada.
 */
export class AddSignatureKeyVersioning1709000000402 implements MigrationInterface {
  name = 'AddSignatureKeyVersioning1709000000402';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public."signatures"
        ADD COLUMN IF NOT EXISTS "signature_key_id" character varying(64),
        ADD COLUMN IF NOT EXISTS "timestamp_token_version" character varying(64)
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.verify_signature_by_hash_public_versioned(
        p_hash text
      )
      RETURNS TABLE (
        signature_hash text,
        signed_at timestamptz,
        timestamp_authority text,
        type text,
        timestamp_token text,
        integrity_payload jsonb,
        signature_key_id text,
        timestamp_token_version text
      )
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public, pg_temp
      AS $$
      BEGIN
        IF NOT (p_hash ~ '^[a-f0-9]{64}$') THEN
          RETURN;
        END IF;

        RETURN QUERY
        SELECT
          s.signature_hash::text,
          s.signed_at AT TIME ZONE 'UTC',
          s.timestamp_authority::text,
          s.type::text,
          s.timestamp_token::text,
          s.integrity_payload,
          s.signature_key_id::text,
          s.timestamp_token_version::text
        FROM public.signatures AS s
        WHERE s.signature_hash = p_hash
          AND s.deleted_at IS NULL
        LIMIT 1;
      END;
      $$;
    `);

    await queryRunner.query(`
      ALTER FUNCTION public.verify_signature_by_hash_public_versioned(text)
      OWNER TO sgs_function_owner
    `);
    await queryRunner.query(`
      REVOKE EXECUTE ON FUNCTION
        public.verify_signature_by_hash_public_versioned(text)
      FROM PUBLIC, sgs_admin
    `);
    await queryRunner.query(`
      GRANT EXECUTE ON FUNCTION
        public.verify_signature_by_hash_public_versioned(text)
      TO sgs_app
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      REVOKE EXECUTE ON FUNCTION
        public.verify_signature_by_hash_public_versioned(text)
      FROM sgs_app
    `);
    await queryRunner.query(`
      DROP FUNCTION IF EXISTS public.verify_signature_by_hash_public_versioned(text)
    `);
    await queryRunner.query(`
      ALTER TABLE public."signatures"
        DROP COLUMN IF EXISTS "timestamp_token_version",
        DROP COLUMN IF EXISTS "signature_key_id"
    `);
  }
}
