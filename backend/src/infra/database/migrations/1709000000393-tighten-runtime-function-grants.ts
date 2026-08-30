import { MigrationInterface, QueryRunner } from 'typeorm';

type FunctionGrantRow = {
  oid: string;
  expected_identity?: string;
  identity: string;
  owner: string;
  manageable: boolean;
  direct_execute: boolean;
  public_execute: boolean;
};

function rowsOf<T>(result: unknown): T[] {
  return Array.isArray(result) ? (result as T[]) : [];
}

function booleanValue(value: unknown): boolean {
  return value === true || value === 't' || value === 'true';
}

/**
 * The runtime contract is intentionally signature-based. A name-only grant
 * would be unsafe if a later overload is introduced in public.
 */
export const APPROVED_RUNTIME_FUNCTION_IDENTITIES = [
  'public.current_company()',
  'public.is_super_admin()',
  'public.current_user_role()',
  'public.current_app_user_id()',
  'public.current_site_id()',
  'public.current_site_scope()',
  'public.current_site_ids()',
  'public.update_updated_at_column()',
  'public.try_parse_uuid(text)',
  'public.find_login_user(text, text)',
  'public.update_login_user_password_hash(uuid, text)',
  'public.find_user_bridge(uuid, uuid)',
  'public.reset_login_user_password(uuid, text)',
  'public.verify_signature_by_hash_public(text)',
] as const;

export const HARDENED_SECURITY_DEFINER_FUNCTION_IDENTITIES = [
  'public.find_login_user(text, text)',
  'public.update_login_user_password_hash(uuid, text)',
  'public.find_user_bridge(uuid, uuid)',
  'public.reset_login_user_password(uuid, text)',
  'public.verify_signature_by_hash_public(text)',
] as const;

const approvedSignaturesSql = APPROVED_RUNTIME_FUNCTION_IDENTITIES.map(
  (identity) => `('${identity}', '${identity}'::regprocedure)`,
).join(',\n          ');

/**
 * Remove o grant histórico amplo de EXECUTE sem atravessar owners mistos.
 *
 * A migration 0392 transfere cinco funções SECURITY DEFINER para
 * sgs_function_owner. Portanto, 0393 só revoga grants diretos que o executor
 * administra e preserva as cinco entradas aprovadas sem impersonação.
 */
export class TightenRuntimeFunctionGrants1709000000393 implements MigrationInterface {
  name = 'TightenRuntimeFunctionGrants1709000000393';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const runtimeRole = rowsOf<{ role_present: boolean }>(
      await queryRunner.query(`
        SELECT EXISTS (
          SELECT 1 FROM pg_roles WHERE rolname = 'sgs_app'
        ) AS role_present
      `),
    )[0];
    if (!booleanValue(runtimeRole?.role_present)) {
      throw new Error('0393 runtime role sgs_app is absent');
    }

    const directSgsAppExecute = rowsOf<FunctionGrantRow>(
      await queryRunner.query(`
        SELECT
          p.oid::text AS oid,
          p.oid::regprocedure::text AS identity,
          owner_role.rolname AS owner,
          (
            executor_role.rolsuper OR p.proowner = executor_role.oid
          ) AS manageable,
          EXISTS (
            SELECT 1
            FROM aclexplode(
              COALESCE(p.proacl, acldefault('f', p.proowner))
            ) AS acl
            WHERE acl.grantee = runtime_role.oid
              AND acl.privilege_type = 'EXECUTE'
          ) AS direct_execute,
          EXISTS (
            SELECT 1
            FROM aclexplode(
              COALESCE(p.proacl, acldefault('f', p.proowner))
            ) AS acl
            WHERE acl.grantee = 0
              AND acl.privilege_type = 'EXECUTE'
          ) AS public_execute
        FROM pg_proc AS p
        JOIN pg_namespace AS function_schema
          ON function_schema.oid = p.pronamespace
        JOIN pg_roles AS owner_role
          ON owner_role.oid = p.proowner
        CROSS JOIN (
          SELECT oid, rolsuper
          FROM pg_roles
          WHERE rolname = current_user
        ) AS executor_role
        CROSS JOIN (
          SELECT oid
          FROM pg_roles
          WHERE rolname = 'sgs_app'
        ) AS runtime_role
        WHERE function_schema.nspname = 'public'
          AND p.prokind = 'f'
          AND EXISTS (
            SELECT 1
            FROM aclexplode(
              COALESCE(p.proacl, acldefault('f', p.proowner))
            ) AS acl
            WHERE acl.grantee = runtime_role.oid
              AND acl.privilege_type = 'EXECUTE'
          )
        ORDER BY p.oid
      `),
    );

    const approvedOids = new Set<string>();
    for (const identity of APPROVED_RUNTIME_FUNCTION_IDENTITIES) {
      const rows = rowsOf<{ oid: string }>(
        await queryRunner.query(
          `SELECT '${identity}'::regprocedure::oid::text AS oid`,
        ),
      );
      if (rows.length !== 1) {
        throw new Error(`0393 approved function is absent: ${identity}`);
      }
      approvedOids.add(rows[0].oid);
    }
    const excessDirectExecute = directSgsAppExecute.filter(
      (grant) => !approvedOids.has(grant.oid),
    );

    // Preflight every excess grant before changing any ACL. If one owner is
    // not manageable, the migration fails closed without partial hardening.
    for (const grant of excessDirectExecute) {
      if (!booleanValue(grant.manageable)) {
        throw new Error(
          `0393 cannot administer excess EXECUTE on ${grant.identity} owned by ${grant.owner}`,
        );
      }
    }

    for (const grant of excessDirectExecute) {
      await queryRunner.query(
        `REVOKE EXECUTE ON FUNCTION ${grant.identity} FROM sgs_app`,
      );
    }

    const approvedFunctions = rowsOf<FunctionGrantRow>(
      await queryRunner.query(`
        WITH approved(expected_identity, signature) AS (
          VALUES
          ${approvedSignaturesSql}
        )
        SELECT
          approved.expected_identity,
          p.oid::text AS oid,
          p.oid::regprocedure::text AS identity,
          owner_role.rolname AS owner,
          (
            executor_role.rolsuper OR p.proowner = executor_role.oid
          ) AS manageable,
          EXISTS (
            SELECT 1
            FROM aclexplode(
              COALESCE(p.proacl, acldefault('f', p.proowner))
            ) AS acl
            WHERE acl.grantee = runtime_role.oid
              AND acl.privilege_type = 'EXECUTE'
          ) AS direct_execute,
          EXISTS (
            SELECT 1
            FROM aclexplode(
              COALESCE(p.proacl, acldefault('f', p.proowner))
            ) AS acl
            WHERE acl.grantee = 0
              AND acl.privilege_type = 'EXECUTE'
          ) AS public_execute
        FROM approved
        JOIN pg_proc AS p ON p.oid = approved.signature::oid
        JOIN pg_roles AS owner_role ON owner_role.oid = p.proowner
        CROSS JOIN (
          SELECT oid, rolsuper
          FROM pg_roles
          WHERE rolname = current_user
        ) AS executor_role
        CROSS JOIN (
          SELECT oid
          FROM pg_roles
          WHERE rolname = 'sgs_app'
        ) AS runtime_role
      `),
    );

    if (
      approvedFunctions.length !== APPROVED_RUNTIME_FUNCTION_IDENTITIES.length
    ) {
      throw new Error(
        `0393 approved runtime function count mismatch: expected ${APPROVED_RUNTIME_FUNCTION_IDENTITIES.length}, got ${approvedFunctions.length}`,
      );
    }

    const approvedByIdentity = new Map(
      approvedFunctions.map((functionRow) => [
        functionRow.expected_identity,
        functionRow,
      ]),
    );
    const hardenedIdentitySet = new Set<string>(
      HARDENED_SECURITY_DEFINER_FUNCTION_IDENTITIES,
    );
    for (const identity of APPROVED_RUNTIME_FUNCTION_IDENTITIES) {
      const functionRow = approvedByIdentity.get(identity);
      if (!functionRow) {
        throw new Error(`0393 approved function is absent: ${identity}`);
      }

      if (!booleanValue(functionRow.direct_execute)) {
        if (hardenedIdentitySet.has(identity)) {
          throw new Error(
            `0393 hardened function lost direct EXECUTE: ${identity}`,
          );
        }
        if (!booleanValue(functionRow.manageable)) {
          throw new Error(
            `0393 cannot grant approved EXECUTE on ${identity} owned by ${functionRow.owner}`,
          );
        }
        await queryRunner.query(
          `GRANT EXECUTE ON FUNCTION ${identity} TO sgs_app`,
        );
      }
    }

    const hardenedFunctions = HARDENED_SECURITY_DEFINER_FUNCTION_IDENTITIES.map(
      (identity) => approvedByIdentity.get(identity),
    );
    for (const functionRow of hardenedFunctions) {
      if (
        !functionRow ||
        functionRow.owner !== 'sgs_function_owner' ||
        !booleanValue(functionRow.direct_execute) ||
        booleanValue(functionRow.public_execute)
      ) {
        throw new Error(
          '0393 hardened SECURITY DEFINER ownership or EXECUTE contract failed',
        );
      }
    }

    const remainingDirectSgsAppExecute = rowsOf<
      Pick<FunctionGrantRow, 'oid' | 'identity'>
    >(
      await queryRunner.query(`
        SELECT p.oid::text AS oid, p.oid::regprocedure::text AS identity
        FROM pg_proc AS p
        JOIN pg_namespace AS function_schema
          ON function_schema.oid = p.pronamespace
        CROSS JOIN (
          SELECT oid
          FROM pg_roles
          WHERE rolname = 'sgs_app'
        ) AS runtime_role
        WHERE function_schema.nspname = 'public'
          AND p.prokind = 'f'
          AND EXISTS (
            SELECT 1
            FROM aclexplode(
              COALESCE(p.proacl, acldefault('f', p.proowner))
            ) AS acl
            WHERE acl.grantee = runtime_role.oid
              AND acl.privilege_type = 'EXECUTE'
          )
      `),
    );
    const remainingExcess = remainingDirectSgsAppExecute.filter(
      ({ oid }) => !approvedOids.has(oid),
    );
    if (remainingExcess.length > 0) {
      throw new Error(
        `0393 excess direct EXECUTE remains: ${remainingExcess
          .map(({ identity }) => identity)
          .join(', ')}`,
      );
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Restore-first rollback policy: never recreate blanket runtime EXECUTE.
    // A forward corrective migration must be used if a precise reverse is
    // required after reviewing the target ACL state.
  }
}
