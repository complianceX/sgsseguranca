import { MigrationInterface, QueryRunner } from 'typeorm';

type RoleIdentityRow = {
  current_user: string;
  session_user: string;
  rolsuper: boolean;
  rolcreaterole: boolean;
};

type RoleMembershipRow = {
  grantor: string;
  admin_option: boolean;
  inherit_option: boolean;
  set_option: boolean;
};

type FunctionContractRow = {
  owner: string;
  security_definer: boolean;
  config: string[] | null;
  public_execute: boolean;
  admin_execute: boolean;
  app_execute: boolean;
  owner_can_select_signatures: boolean;
};

const FUNCTION_OWNER = 'sgs_function_owner' as const;
const FUNCTION_SIGNATURE =
  'public.verify_signature_by_hash_public_versioned(text)' as const;

function rowsOf<T>(result: unknown): T[] {
  return Array.isArray(result) ? (result as T[]) : [];
}

function booleanValue(value: unknown): boolean {
  return value === true || value === 't' || value === 'true';
}

function optionLiteral(value: boolean): 'TRUE' | 'FALSE' {
  return value ? 'TRUE' : 'FALSE';
}

async function queryRows<T>(
  queryRunner: QueryRunner,
  sql: string,
): Promise<T[]> {
  return rowsOf<T>(await queryRunner.query(sql));
}

async function assertMigrationExecutor(
  queryRunner: QueryRunner,
): Promise<{ currentUser: string; isSuperuser: boolean }> {
  const identity = (
    await queryRows<RoleIdentityRow>(
      queryRunner,
      `
        SELECT
          current_user,
          session_user,
          r.rolsuper,
          r.rolcreaterole
        FROM pg_roles AS r
        WHERE r.rolname = current_user
      `,
    )
  )[0];

  if (!identity?.current_user || !identity.session_user) {
    throw new Error('0402 could not identify the migration executor');
  }
  if (
    identity.current_user === 'sgs_app' ||
    identity.session_user === 'sgs_app'
  ) {
    throw new Error('0402 cannot run with the runtime role sgs_app');
  }

  const isSuperuser = booleanValue(identity.rolsuper);
  if (!isSuperuser && !booleanValue(identity.rolcreaterole)) {
    throw new Error('0402 requires a SUPERUSER or CREATEROLE executor');
  }

  return { currentUser: identity.current_user, isSuperuser };
}

async function assertPrerequisites(queryRunner: QueryRunner): Promise<void> {
  const roles = await queryRows<{ role_name: string; present: boolean }>(
    queryRunner,
    `
      SELECT required.role_name, EXISTS (
        SELECT 1 FROM pg_roles WHERE pg_roles.rolname = required.role_name
      ) AS present
      FROM unnest(ARRAY['sgs_function_owner', 'sgs_app', 'sgs_admin'])
        AS required(role_name)
    `,
  );
  const missingRole = roles.find(({ present }) => !booleanValue(present));
  if (missingRole) {
    throw new Error(`0402 required role is absent: ${missingRole.role_name}`);
  }

  const table = (
    await queryRows<{ present: boolean }>(
      queryRunner,
      `SELECT to_regclass('public.signatures') IS NOT NULL AS present`,
    )
  )[0];
  if (!booleanValue(table?.present)) {
    throw new Error('0402 required table public.signatures is absent');
  }

  const ownerState = (
    await queryRows<{
      can_create: boolean;
      can_select_signatures: boolean;
    }>(
      queryRunner,
      `
        SELECT
          has_schema_privilege('${FUNCTION_OWNER}', 'public', 'CREATE')
            AS can_create,
          has_table_privilege('${FUNCTION_OWNER}', 'public.signatures', 'SELECT')
            AS can_select_signatures
      `,
    )
  )[0];
  if (booleanValue(ownerState?.can_create)) {
    throw new Error(
      '0402 found pre-existing CREATE privilege for sgs_function_owner',
    );
  }
  if (!booleanValue(ownerState?.can_select_signatures)) {
    throw new Error(
      '0402 requires sgs_function_owner SELECT on public.signatures',
    );
  }
}

async function readExecutorMembership(
  queryRunner: QueryRunner,
): Promise<RoleMembershipRow[]> {
  return queryRows<RoleMembershipRow>(
    queryRunner,
    `
      SELECT
        grantor.rolname AS grantor,
        am.admin_option,
        am.inherit_option,
        am.set_option
      FROM pg_auth_members AS am
      JOIN pg_roles AS granted_role ON granted_role.oid = am.roleid
      JOIN pg_roles AS member_role ON member_role.oid = am.member
      JOIN pg_roles AS grantor ON grantor.oid = am.grantor
      WHERE granted_role.rolname = '${FUNCTION_OWNER}'
        AND member_role.rolname = current_user
    `,
  );
}

function assertMembershipPreflight(
  memberships: RoleMembershipRow[],
  currentUser: string,
): RoleMembershipRow | undefined {
  if (memberships.length > 1) {
    throw new Error(
      '0402 found multiple executor grants for sgs_function_owner',
    );
  }
  if (memberships.some((membership) => booleanValue(membership.set_option))) {
    throw new Error(
      '0402 found a pre-existing SET-capable membership for sgs_function_owner',
    );
  }
  if (
    memberships.some((membership) => booleanValue(membership.inherit_option))
  ) {
    throw new Error(
      '0402 found a pre-existing INHERIT membership for sgs_function_owner',
    );
  }
  if (memberships[0] && memberships[0].grantor !== currentUser) {
    throw new Error(
      '0402 cannot safely modify executor membership granted by another role',
    );
  }
  return memberships[0];
}

async function establishTemporaryMembership(
  queryRunner: QueryRunner,
  currentUser: string,
): Promise<void> {
  await queryRunner.query(`
    GRANT ${FUNCTION_OWNER} TO CURRENT_USER
      WITH SET TRUE, INHERIT FALSE
  `);

  const memberships = await readExecutorMembership(queryRunner);
  if (
    !memberships.some(
      (membership) =>
        membership.grantor === currentUser &&
        booleanValue(membership.set_option) &&
        !booleanValue(membership.inherit_option),
    )
  ) {
    throw new Error('0402 could not establish temporary SET capability');
  }
}

async function restoreMembership(
  queryRunner: QueryRunner,
  previousMembership: RoleMembershipRow | undefined,
): Promise<void> {
  if (!previousMembership) {
    await queryRunner.query(`REVOKE ${FUNCTION_OWNER} FROM CURRENT_USER`);
    return;
  }

  await queryRunner.query(`
    GRANT ${FUNCTION_OWNER} TO CURRENT_USER
      WITH ADMIN ${optionLiteral(booleanValue(previousMembership.admin_option))},
           INHERIT ${optionLiteral(booleanValue(previousMembership.inherit_option))},
           SET ${optionLiteral(booleanValue(previousMembership.set_option))}
  `);
}

async function assertFunctionContract(queryRunner: QueryRunner): Promise<void> {
  const contract = (
    await queryRows<FunctionContractRow>(
      queryRunner,
      `
        SELECT
          pg_get_userbyid(p.proowner) AS owner,
          p.prosecdef AS security_definer,
          p.proconfig AS config,
          EXISTS (
            SELECT 1
            FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
            WHERE acl.grantee = 0
              AND acl.privilege_type = 'EXECUTE'
          ) AS public_execute,
          EXISTS (
            SELECT 1
            FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
            JOIN pg_roles r ON r.oid = acl.grantee
            WHERE r.rolname = 'sgs_admin'
              AND acl.privilege_type = 'EXECUTE'
          ) AS admin_execute,
          EXISTS (
            SELECT 1
            FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
            JOIN pg_roles r ON r.oid = acl.grantee
            WHERE r.rolname = 'sgs_app'
              AND acl.privilege_type = 'EXECUTE'
          ) AS app_execute,
          has_table_privilege(
            '${FUNCTION_OWNER}', 'public.signatures', 'SELECT'
          ) AS owner_can_select_signatures
        FROM pg_proc AS p
        WHERE p.oid = '${FUNCTION_SIGNATURE}'::regprocedure
      `,
    )
  )[0];

  if (
    !contract ||
    contract.owner !== FUNCTION_OWNER ||
    !booleanValue(contract.security_definer) ||
    !contract.config?.includes('search_path=pg_catalog, public, pg_temp') ||
    booleanValue(contract.public_execute) ||
    booleanValue(contract.admin_execute) ||
    !booleanValue(contract.app_execute) ||
    !booleanValue(contract.owner_can_select_signatures)
  ) {
    throw new Error('0402 versioned verification function contract failed');
  }
}

/**
 * Adiciona somente metadados não secretos para selecionar a chave de
 * verificação. Tokens e linhas históricas permanecem inalterados e NULL
 * significa que o registro depende do contrato legado v1.
 *
 * A função versionada é separada da função pública histórica para que clientes
 * SQL existentes mantenham o mesmo contrato durante a adoção coordenada.
 *
 * PostgreSQL 17 exige que o executor consiga SET ROLE para o novo owner e que
 * o owner tenha CREATE no schema durante a transferência. Essas capacidades
 * são concedidas apenas temporariamente e removidas antes do pós-check.
 */
export class AddSignatureKeyVersioning1709000000402 implements MigrationInterface {
  name = 'AddSignatureKeyVersioning1709000000402';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const executor = await assertMigrationExecutor(queryRunner);
    await assertPrerequisites(queryRunner);
    const previousMembership = assertMembershipPreflight(
      await readExecutorMembership(queryRunner),
      executor.currentUser,
    );

    let temporaryMembership = false;
    let temporarySchemaCreate = false;

    try {
      if (!executor.isSuperuser) {
        temporaryMembership = true;
        await establishTemporaryMembership(queryRunner, executor.currentUser);
      }

      await queryRunner.query(`
        GRANT CREATE ON SCHEMA public
          TO ${FUNCTION_OWNER}
      `);
      temporarySchemaCreate = true;

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
        $$
      `);

      await queryRunner.query(`
        REVOKE EXECUTE ON FUNCTION
          ${FUNCTION_SIGNATURE}
        FROM PUBLIC, sgs_admin
      `);
      await queryRunner.query(`
        GRANT EXECUTE ON FUNCTION
          ${FUNCTION_SIGNATURE}
        TO sgs_app
      `);
      await queryRunner.query(`
        ALTER FUNCTION ${FUNCTION_SIGNATURE}
          OWNER TO ${FUNCTION_OWNER}
      `);

      await queryRunner.query(`
        REVOKE CREATE ON SCHEMA public
          FROM ${FUNCTION_OWNER}
      `);
      temporarySchemaCreate = false;

      if (temporaryMembership) {
        await restoreMembership(queryRunner, previousMembership);
        temporaryMembership = false;
      }

      await assertFunctionContract(queryRunner);
    } catch (error) {
      const cleanupErrors: Error[] = [];

      if (temporarySchemaCreate) {
        try {
          await queryRunner.query(`
            REVOKE CREATE ON SCHEMA public
              FROM ${FUNCTION_OWNER}
          `);
        } catch (cleanupError) {
          cleanupErrors.push(
            cleanupError instanceof Error
              ? cleanupError
              : new Error(String(cleanupError)),
          );
        }
      }

      if (temporaryMembership) {
        try {
          await restoreMembership(queryRunner, previousMembership);
        } catch (cleanupError) {
          cleanupErrors.push(
            cleanupError instanceof Error
              ? cleanupError
              : new Error(String(cleanupError)),
          );
        }
      }

      if (cleanupErrors.length > 0) {
        throw new Error(
          `0402 operation failed and cleanup also failed: ${cleanupErrors
            .map((cleanupError) => cleanupError.message)
            .join(' | ')}`,
          { cause: error },
        );
      }
      throw error;
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const executor = await assertMigrationExecutor(queryRunner);
    const memberships = await readExecutorMembership(queryRunner);
    const previousMembership = assertMembershipPreflight(
      memberships,
      executor.currentUser,
    );
    let temporaryMembership = false;
    let roleWasSet = false;

    try {
      const functionRows = await queryRows<{ owner: string | null }>(
        queryRunner,
        `
          SELECT pg_get_userbyid(p.proowner) AS owner
          FROM pg_proc AS p
          WHERE p.oid = to_regprocedure('${FUNCTION_SIGNATURE}')
        `,
      );

      if (functionRows[0]) {
        if (functionRows[0].owner !== FUNCTION_OWNER) {
          throw new Error(
            `0402 down refuses function owned by ${functionRows[0].owner}`,
          );
        }

        if (!executor.isSuperuser) {
          temporaryMembership = true;
          await establishTemporaryMembership(queryRunner, executor.currentUser);
        }
        await queryRunner.query(`SET ROLE ${FUNCTION_OWNER}`);
        roleWasSet = true;
        await queryRunner.query(`DROP FUNCTION ${FUNCTION_SIGNATURE}`);
        await queryRunner.query('RESET ROLE');
        roleWasSet = false;

        if (temporaryMembership) {
          await restoreMembership(queryRunner, previousMembership);
          temporaryMembership = false;
        }
      }

      await queryRunner.query(`
        ALTER TABLE public."signatures"
          DROP COLUMN IF EXISTS "timestamp_token_version",
          DROP COLUMN IF EXISTS "signature_key_id"
      `);
    } catch (error) {
      if (roleWasSet) {
        try {
          await queryRunner.query('RESET ROLE');
        } catch {
          // TypeORM rollback remains the final safety boundary.
        }
      }
      if (temporaryMembership) {
        try {
          await restoreMembership(queryRunner, previousMembership);
        } catch {
          // Preserve the original rollback error.
        }
      }
      throw error;
    }
  }
}
