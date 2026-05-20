import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SECURITY: prevent new CPF plaintext from being persisted.
 *
 * The SGS uses `users.cpf_hash` (deterministic) and `users.cpf_ciphertext` (AES-GCM)
 * as the canonical storage. `users.cpf` is a legacy column that may still exist
 * in older rows until a controlled backfill runs.
 *
 * This trigger blocks new plaintext-only writes and only clears plaintext when
 * the canonical hash/ciphertext are already present. Existing legacy rows are
 * preserved until the controlled backfill runs.
 */
export class NullifyUsersCpfPlaintext1709000000207 implements MigrationInterface {
  name = 'NullifyUsersCpfPlaintext1709000000207';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.nullify_users_cpf_plaintext()
      RETURNS trigger AS $$
      BEGIN
        IF NEW.cpf IS NOT NULL AND btrim(NEW.cpf) <> '' THEN
          IF NEW.cpf_hash IS NOT NULL
             AND btrim(NEW.cpf_hash) <> ''
             AND NEW.cpf_ciphertext IS NOT NULL
             AND btrim(NEW.cpf_ciphertext) <> '' THEN
            NEW.cpf := NULL;
          ELSIF TG_OP = 'INSERT' THEN
            RAISE EXCEPTION
              'users.cpf plaintext cannot be persisted without cpf_hash and cpf_ciphertext'
              USING ERRCODE = '23514';
          ELSIF NEW.cpf IS DISTINCT FROM OLD.cpf THEN
            RAISE EXCEPTION
              'users.cpf plaintext cannot be persisted without cpf_hash and cpf_ciphertext'
              USING ERRCODE = '23514';
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
         SET search_path = public;
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_nullify_users_cpf_plaintext ON public.users
    `);

    await queryRunner.query(`
      CREATE TRIGGER trg_nullify_users_cpf_plaintext
      BEFORE INSERT OR UPDATE ON public.users
      FOR EACH ROW
      EXECUTE FUNCTION public.nullify_users_cpf_plaintext()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_nullify_users_cpf_plaintext ON public.users
    `);
    await queryRunner.query(`
      DROP FUNCTION IF EXISTS public.nullify_users_cpf_plaintext()
    `);
  }
}
