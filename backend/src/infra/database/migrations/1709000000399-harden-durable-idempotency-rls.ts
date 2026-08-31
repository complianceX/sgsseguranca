import { MigrationInterface, QueryRunner } from 'typeorm';

const RUNTIME_ROLE = 'sgs_app';
const TABLE = 'public.idempotency_durable_records';
const POLICY = 'idempotency_scope_isolation';

const SHA256_VECTORS = [
  {
    input: 'user:sha256-equivalence-test',
    expected:
      'fc578bdbc299de6bad9e5f3047ce90fb903858d84ee9a6eadc732f9547ca90d8',
  },
  {
    input:
      'tenant:00000000-0000-4000-8000-000000000001:user:00000000-0000-4000-8000-000000000002',
    expected:
      '3e1fe77984026eea40b765f852f3f454c726ed13e97025669899f1ad706a5697',
  },
] as const;

type Row = Record<string, unknown>;

function isTruthy(value: unknown): boolean {
  return value === true || value === 't' || value === 'true';
}

/**
 * Protege o registro durável sem armazenar o escopo em claro.
 *
 * A política reconstrói exatamente os dois formatos gerados pelo
 * IdempotencyInterceptor. `is_super_admin` não participa da decisão: replay
 * de idempotência continua pertencendo ao usuário e ao tenant do escopo.
 */
export class HardenDurableIdempotencyRls1709000000399 implements MigrationInterface {
  name = 'HardenDurableIdempotencyRls1709000000399';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.assertPreflight(queryRunner);

    await queryRunner.query(`
      ALTER TABLE ${TABLE} ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE ${TABLE} FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS "${POLICY}" ON ${TABLE}
    `);
    await queryRunner.query(`
      CREATE POLICY "${POLICY}"
      ON ${TABLE}
      FOR ALL
      TO ${RUNTIME_ROLE}
      USING (
        current_app_user_id() IS NOT NULL
        AND scope_hash = encode(
          public.digest(
            CASE
              WHEN NULLIF(current_setting('app.current_company_id', true), '') IS NULL
               AND NULLIF(current_setting('app.current_company', true), '') IS NULL
                THEN 'user:' || current_app_user_id()::text
              WHEN current_company() IS NOT NULL
                THEN 'tenant:' || current_company()::text || ':user:' || current_app_user_id()::text
              ELSE NULL
            END,
            'sha256'
          ),
          'hex'
        )
      )
      WITH CHECK (
        current_app_user_id() IS NOT NULL
        AND scope_hash = encode(
          public.digest(
            CASE
              WHEN NULLIF(current_setting('app.current_company_id', true), '') IS NULL
               AND NULLIF(current_setting('app.current_company', true), '') IS NULL
                THEN 'user:' || current_app_user_id()::text
              WHEN current_company() IS NOT NULL
                THEN 'tenant:' || current_company()::text || ':user:' || current_app_user_id()::text
              ELSE NULL
            END,
            'sha256'
          ),
          'hex'
        )
      )
    `);

    await queryRunner.query(`
      REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE ${TABLE} FROM ${RUNTIME_ROLE}
    `);
    await queryRunner.query(`
      REVOKE ALL PRIVILEGES ON TABLE ${TABLE} FROM PUBLIC
    `);
    await queryRunner.query(`
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${TABLE} TO ${RUNTIME_ROLE}
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No-op intencional: rollback automático não pode desabilitar RLS nem
    // reabrir acesso irrestrito ao registro durável.
  }

  private async assertPreflight(queryRunner: QueryRunner): Promise<void> {
    const tableRows = (await queryRunner.query(
      `
        SELECT to_regclass($1) AS table_name
      `,
      [TABLE],
    )) as Row[];
    if (!tableRows[0]?.table_name) {
      throw new Error('0399 requires public.idempotency_durable_records');
    }

    const requiredColumns = (await queryRunner.query(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'idempotency_durable_records'
          AND column_name = ANY($1::text[])
      `,
      [['scope_hash', 'method', 'path', 'idempotency_key_hash']],
    )) as Row[];
    if (requiredColumns.length !== 4) {
      throw new Error('0399 durable idempotency columns are incomplete');
    }

    const roleRows = (await queryRunner.query(
      `
        SELECT
          EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS role_exists,
          COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname = $1), false) AS is_superuser,
          COALESCE((SELECT rolbypassrls FROM pg_roles WHERE rolname = $1), false) AS bypass_rls,
          COALESCE((SELECT pg_get_userbyid(c.relowner) = $1
                    FROM pg_class c
                    WHERE c.oid = $2::regclass), false) AS owns_table
      `,
      [RUNTIME_ROLE, TABLE],
    )) as Row[];
    const role = roleRows[0];
    if (!isTruthy(role?.role_exists)) {
      throw new Error('0399 requires the sgs_app role');
    }
    if (isTruthy(role?.is_superuser) || isTruthy(role?.bypass_rls)) {
      throw new Error('0399 refuses an escalated sgs_app role');
    }
    if (isTruthy(role?.owns_table)) {
      throw new Error('0399 refuses a runtime-owned idempotency table');
    }

    const contextRows = (await queryRunner.query(`
      SELECT
        to_regprocedure('public.current_company()') IS NOT NULL AS company_function,
        to_regprocedure('public.current_app_user_id()') IS NOT NULL AS user_function,
        to_regprocedure('public.digest(text,text)') IS NOT NULL AS digest_function,
        has_function_privilege('${RUNTIME_ROLE}', 'public.current_company()', 'EXECUTE') AS company_execute,
        has_function_privilege('${RUNTIME_ROLE}', 'public.current_app_user_id()', 'EXECUTE') AS user_execute,
        has_function_privilege('${RUNTIME_ROLE}', 'public.digest(text,text)', 'EXECUTE') AS digest_execute
    `)) as Row[];
    const context = contextRows[0];
    if (
      !isTruthy(context?.company_function) ||
      !isTruthy(context?.user_function) ||
      !isTruthy(context?.digest_function) ||
      !isTruthy(context?.company_execute) ||
      !isTruthy(context?.user_execute) ||
      !isTruthy(context?.digest_execute)
    ) {
      throw new Error(
        '0399 required RLS context or SHA-256 capability is unavailable',
      );
    }

    for (const vector of SHA256_VECTORS) {
      const rows = (await queryRunner.query(
        `SELECT encode(public.digest($1, 'sha256'), 'hex') AS hash`,
        [vector.input],
      )) as Array<{ hash?: string }>;
      if (rows[0]?.hash !== vector.expected) {
        throw new Error('0399 PostgreSQL SHA-256 is not Node-compatible');
      }
    }

    const existingPolicies = (await queryRunner.query(
      `
        SELECT polname
        FROM pg_policy
        WHERE polrelid = $1::regclass
      `,
      [TABLE],
    )) as Array<{ polname?: string }>;
    if (existingPolicies.length > 0) {
      throw new Error('0399 refuses to replace an unknown existing policy');
    }
  }
}
