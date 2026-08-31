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

type RoleContractRow = {
  rolcanlogin: boolean;
  rolsuper: boolean;
  rolcreatedb: boolean;
  rolcreaterole: boolean;
  rolinherit: boolean;
  rolbypassrls: boolean;
  schema_usage: boolean;
  schema_create: boolean;
  app_member: boolean;
};

type TablePrivilegeRow = {
  can_select: boolean;
  can_insert: boolean;
  can_update: boolean;
  can_delete: boolean;
  can_truncate: boolean;
  can_references: boolean;
  can_trigger: boolean;
};

type FunctionOwnerRow = {
  owner: string;
};

type FunctionContractRow = {
  owner: string;
  security_definer: boolean;
  language_name: string;
  config: string[] | null;
  public_execute: boolean;
  admin_execute: boolean;
  app_execute: boolean;
};

const FUNCTION_NAME = 'public.verify_apr_evidence_by_hash_public' as const;
const FUNCTION_SIGNATURE =
  'public.verify_apr_evidence_by_hash_public(text)' as const;
const FUNCTION_OWNER = 'sgs_function_owner' as const;

function rowsOf<T>(result: unknown): T[] {
  return Array.isArray(result) ? (result as T[]) : [];
}

function booleanValue(value: unknown): boolean {
  return value === true || value === 't' || value === 'true';
}

function optionLiteral(value: boolean): 'TRUE' | 'FALSE' {
  return value ? 'TRUE' : 'FALSE';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
    throw new Error('0396 could not identify the migration executor');
  }
  if (
    identity.current_user === 'sgs_app' ||
    identity.session_user === 'sgs_app'
  ) {
    throw new Error('0396 cannot run with the runtime role sgs_app');
  }

  const isSuperuser = booleanValue(identity.rolsuper);
  if (!isSuperuser && !booleanValue(identity.rolcreaterole)) {
    throw new Error('0396 requires a SUPERUSER or CREATEROLE executor');
  }

  return { currentUser: identity.current_user, isSuperuser };
}

async function assertRequiredRolesAndTable(
  queryRunner: QueryRunner,
): Promise<void> {
  const rows = await queryRows<{ role_name: string; present: boolean }>(
    queryRunner,
    `
      SELECT required.role_name, EXISTS (
        SELECT 1 FROM pg_roles WHERE pg_roles.rolname = required.role_name
      ) AS present
      FROM unnest(ARRAY['sgs_function_owner', 'sgs_app', 'sgs_admin'])
        AS required(role_name)
    `,
  );
  const missingRole = rows.find(({ present }) => !booleanValue(present));
  if (missingRole) {
    throw new Error(`0396 required role is absent: ${missingRole.role_name}`);
  }

  const tableRows = await queryRows<{ present: boolean }>(
    queryRunner,
    `
      SELECT to_regclass('public.apr_risk_evidences') IS NOT NULL AS present
    `,
  );
  if (!booleanValue(tableRows[0]?.present)) {
    throw new Error('0396 required table public.apr_risk_evidences is absent');
  }
}

async function assertFunctionOwnerRoleContract(
  queryRunner: QueryRunner,
): Promise<void> {
  const role = (
    await queryRows<RoleContractRow>(
      queryRunner,
      `
        SELECT
          r.rolcanlogin,
          r.rolsuper,
          r.rolcreatedb,
          r.rolcreaterole,
          r.rolinherit,
          r.rolbypassrls,
          has_schema_privilege('${FUNCTION_OWNER}', 'public', 'USAGE')
            AS schema_usage,
          has_schema_privilege('${FUNCTION_OWNER}', 'public', 'CREATE')
            AS schema_create,
          EXISTS (
            SELECT 1
            FROM pg_auth_members AS app_membership
            JOIN pg_roles AS app_role
              ON app_role.oid = app_membership.member
            JOIN pg_roles AS owner_role
              ON owner_role.oid = app_membership.roleid
            WHERE app_role.rolname = 'sgs_app'
              AND owner_role.rolname = '${FUNCTION_OWNER}'
          ) AS app_member
        FROM pg_roles AS r
        WHERE r.rolname = '${FUNCTION_OWNER}'
      `,
    )
  )[0];

  if (
    !role ||
    booleanValue(role.rolcanlogin) ||
    booleanValue(role.rolsuper) ||
    booleanValue(role.rolcreatedb) ||
    booleanValue(role.rolcreaterole) ||
    booleanValue(role.rolinherit) ||
    !booleanValue(role.rolbypassrls) ||
    !booleanValue(role.schema_usage) ||
    booleanValue(role.schema_create) ||
    booleanValue(role.app_member)
  ) {
    throw new Error('0396 function owner role contract failed');
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
      JOIN pg_roles AS granted_role
        ON granted_role.oid = am.roleid
      JOIN pg_roles AS member_role
        ON member_role.oid = am.member
      JOIN pg_roles AS grantor
        ON grantor.oid = am.grantor
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
      '0396 found multiple executor grants for sgs_function_owner',
    );
  }
  if (memberships.some((membership) => booleanValue(membership.set_option))) {
    throw new Error(
      '0396 found a pre-existing SET-capable membership for sgs_function_owner',
    );
  }
  if (
    memberships.some((membership) => booleanValue(membership.inherit_option))
  ) {
    throw new Error(
      '0396 found a pre-existing INHERIT membership for sgs_function_owner',
    );
  }
  return memberships.find(({ grantor }) => grantor === currentUser);
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
    throw new Error('0396 could not establish temporary SET capability');
  }
}

async function restoreTemporaryMembership(
  queryRunner: QueryRunner,
  previousMembership: RoleMembershipRow | undefined,
): Promise<void> {
  if (previousMembership) {
    await queryRunner.query(`
      GRANT ${FUNCTION_OWNER} TO CURRENT_USER
        WITH ADMIN ${optionLiteral(booleanValue(previousMembership.admin_option))},
             INHERIT ${optionLiteral(booleanValue(previousMembership.inherit_option))},
             SET ${optionLiteral(booleanValue(previousMembership.set_option))}
    `);
    return;
  }

  await queryRunner.query(`
    REVOKE ${FUNCTION_OWNER}
      FROM CURRENT_USER
  `);
}

async function cleanupTemporaryPrivileges(
  queryRunner: QueryRunner,
  options: {
    temporarySchemaCreate: boolean;
    temporaryMembership: boolean;
    previousMembership: RoleMembershipRow | undefined;
  },
): Promise<Error[]> {
  const errors: Error[] = [];
  if (options.temporarySchemaCreate) {
    try {
      await queryRunner.query(`
        REVOKE CREATE ON SCHEMA public
          FROM ${FUNCTION_OWNER}
      `);
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }
  if (options.temporaryMembership) {
    try {
      await restoreTemporaryMembership(queryRunner, options.previousMembership);
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }
  return errors;
}

function throwWithCleanup(
  operationError: unknown,
  cleanupErrors: Error[],
): never {
  if (operationError && cleanupErrors.length > 0) {
    throw new Error(
      `0396 operation failed: ${errorMessage(operationError)}; cleanup failed: ${cleanupErrors.map(errorMessage).join(' | ')}`,
      { cause: operationError },
    );
  }
  if (operationError) {
    throw operationError instanceof Error
      ? operationError
      : new Error(errorMessage(operationError));
  }
  if (cleanupErrors.length > 0) {
    throw new Error(
      `0396 temporary privilege cleanup failed: ${cleanupErrors.map(errorMessage).join(' | ')}`,
    );
  }
  throw new Error('0396 migration failed without an error');
}

async function assertAprTablePrivilegeContract(
  queryRunner: QueryRunner,
): Promise<void> {
  const privileges = (
    await queryRows<TablePrivilegeRow>(
      queryRunner,
      `
        SELECT
          has_table_privilege('${FUNCTION_OWNER}', 'public.apr_risk_evidences', 'SELECT') AS can_select,
          has_table_privilege('${FUNCTION_OWNER}', 'public.apr_risk_evidences', 'INSERT') AS can_insert,
          has_table_privilege('${FUNCTION_OWNER}', 'public.apr_risk_evidences', 'UPDATE') AS can_update,
          has_table_privilege('${FUNCTION_OWNER}', 'public.apr_risk_evidences', 'DELETE') AS can_delete,
          has_table_privilege('${FUNCTION_OWNER}', 'public.apr_risk_evidences', 'TRUNCATE') AS can_truncate,
          has_table_privilege('${FUNCTION_OWNER}', 'public.apr_risk_evidences', 'REFERENCES') AS can_references,
          has_table_privilege('${FUNCTION_OWNER}', 'public.apr_risk_evidences', 'TRIGGER') AS can_trigger
      `,
    )
  )[0];

  if (
    !privileges ||
    !booleanValue(privileges.can_select) ||
    booleanValue(privileges.can_insert) ||
    booleanValue(privileges.can_update) ||
    booleanValue(privileges.can_delete) ||
    booleanValue(privileges.can_truncate) ||
    booleanValue(privileges.can_references) ||
    booleanValue(privileges.can_trigger)
  ) {
    throw new Error('0396 apr_risk_evidences privilege contract failed');
  }
}

async function assertFunctionContract(queryRunner: QueryRunner): Promise<void> {
  const functionContract = (
    await queryRows<FunctionContractRow>(
      queryRunner,
      `
        SELECT
          pg_get_userbyid(p.proowner) AS owner,
          p.prosecdef AS security_definer,
          language.lanname AS language_name,
          p.proconfig AS config,
          has_function_privilege('public', '${FUNCTION_SIGNATURE}', 'EXECUTE') AS public_execute,
          has_function_privilege('sgs_admin', '${FUNCTION_SIGNATURE}', 'EXECUTE') AS admin_execute,
          has_function_privilege('sgs_app', '${FUNCTION_SIGNATURE}', 'EXECUTE') AS app_execute
        FROM pg_proc AS p
        JOIN pg_language AS language ON language.oid = p.prolang
        WHERE p.oid = '${FUNCTION_SIGNATURE}'::regprocedure
      `,
    )
  )[0];

  if (
    !functionContract ||
    functionContract.owner !== FUNCTION_OWNER ||
    !booleanValue(functionContract.security_definer) ||
    functionContract.language_name !== 'sql' ||
    !functionContract.config?.includes(
      'search_path=pg_catalog, public, pg_temp',
    ) ||
    booleanValue(functionContract.public_execute) ||
    booleanValue(functionContract.admin_execute) ||
    !booleanValue(functionContract.app_execute)
  ) {
    throw new Error('0396 function SECURITY DEFINER contract failed');
  }
}

async function assertFinalRoleContract(
  queryRunner: QueryRunner,
): Promise<void> {
  await assertFunctionOwnerRoleContract(queryRunner);
  const memberships = await queryRows<{
    set_memberships: string;
    inherit_memberships: string;
  }>(
    queryRunner,
    `
      SELECT
        (
          SELECT count(*)::text
          FROM pg_auth_members AS membership
          JOIN pg_roles AS role_name ON role_name.oid = membership.roleid
          WHERE role_name.rolname = '${FUNCTION_OWNER}'
            AND membership.set_option
        ) AS set_memberships,
        (
          SELECT count(*)::text
          FROM pg_auth_members AS membership
          JOIN pg_roles AS role_name ON role_name.oid = membership.roleid
          WHERE role_name.rolname = '${FUNCTION_OWNER}'
            AND membership.inherit_option
        ) AS inherit_memberships
    `,
  );
  if (
    Number(memberships[0]?.set_memberships) !== 0 ||
    Number(memberships[0]?.inherit_memberships) !== 0
  ) {
    throw new Error('0396 final temporary membership contract failed');
  }
}

/**
 * Permite a validação pública de evidência sem depender de um GUC de
 * super-admin na sessão de aplicação. O retorno é deliberadamente mínimo:
 * somente informa se o hash corresponde ao original ou à marca d'água.
 */
export class CreatePublicAprEvidenceVerifyFunction1709000000396 implements MigrationInterface {
  name = 'CreatePublicAprEvidenceVerifyFunction1709000000396';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const executor = await assertMigrationExecutor(queryRunner);
    await assertRequiredRolesAndTable(queryRunner);
    await assertFunctionOwnerRoleContract(queryRunner);
    const previousMembership = assertMembershipPreflight(
      await readExecutorMembership(queryRunner),
      executor.currentUser,
    );

    let temporaryMembership = false;
    let temporarySchemaCreate = false;
    let operationError: unknown = null;

    try {
      if (!executor.isSuperuser) {
        temporaryMembership = true;
        await establishTemporaryMembership(queryRunner, executor.currentUser);
      }

      const schemaPrivilege = (
        await queryRows<{ has_create: boolean }>(
          queryRunner,
          `
            SELECT has_schema_privilege(
              '${FUNCTION_OWNER}', 'public', 'CREATE'
            ) AS has_create
          `,
        )
      )[0];
      if (booleanValue(schemaPrivilege?.has_create)) {
        throw new Error(
          '0396 found pre-existing CREATE privilege for sgs_function_owner',
        );
      }

      await queryRunner.query(`
        GRANT CREATE ON SCHEMA public
          TO ${FUNCTION_OWNER}
      `);
      temporarySchemaCreate = true;
      const schemaAfterGrant = (
        await queryRows<{ has_create: boolean }>(
          queryRunner,
          `
            SELECT has_schema_privilege(
              '${FUNCTION_OWNER}', 'public', 'CREATE'
            ) AS has_create
          `,
        )
      )[0];
      if (!booleanValue(schemaAfterGrant?.has_create)) {
        throw new Error('0396 could not establish temporary schema CREATE');
      }

      await queryRunner.query(`
        GRANT SELECT ON TABLE public.apr_risk_evidences
          TO ${FUNCTION_OWNER}
      `);
      await assertAprTablePrivilegeContract(queryRunner);

      await queryRunner.query(`
        CREATE OR REPLACE FUNCTION ${FUNCTION_NAME}(
          p_hash text
        )
        RETURNS TABLE (matched_in text)
        LANGUAGE sql
        SECURITY DEFINER
        SET search_path = pg_catalog, public, pg_temp
        AS $$
          SELECT CASE
            WHEN e.hash_sha256 = p_hash THEN 'original'::text
            ELSE 'watermarked'::text
          END AS matched_in
          FROM public.apr_risk_evidences AS e
          WHERE p_hash ~ '^[a-f0-9]{64}$'
            AND (
              e.hash_sha256 = p_hash
              OR e.watermarked_hash_sha256 = p_hash
            )
          ORDER BY CASE WHEN e.hash_sha256 = p_hash THEN 0 ELSE 1 END
          LIMIT 1;
        $$;
      `);

      await queryRunner.query(`
        REVOKE EXECUTE ON FUNCTION ${FUNCTION_SIGNATURE}
          FROM PUBLIC, sgs_admin
      `);
      await queryRunner.query(`
        GRANT EXECUTE ON FUNCTION ${FUNCTION_SIGNATURE}
          TO sgs_app
      `);
      await queryRunner.query(
        `ALTER FUNCTION ${FUNCTION_SIGNATURE} OWNER TO ${FUNCTION_OWNER}`,
      );

      await queryRunner.query(`
        REVOKE CREATE ON SCHEMA public
          FROM ${FUNCTION_OWNER}
      `);
      temporarySchemaCreate = false;
      await restoreTemporaryMembership(queryRunner, previousMembership);
      temporaryMembership = false;

      await assertFinalRoleContract(queryRunner);
      await assertFunctionContract(queryRunner);
    } catch (error) {
      operationError = error;
    }

    const cleanupErrors = await cleanupTemporaryPrivileges(queryRunner, {
      temporarySchemaCreate,
      temporaryMembership,
      previousMembership,
    });
    if (operationError || cleanupErrors.length > 0) {
      throwWithCleanup(operationError, cleanupErrors);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const executor = await assertMigrationExecutor(queryRunner);
    await assertRequiredRolesAndTable(queryRunner);
    await assertFunctionOwnerRoleContract(queryRunner);

    const functionOwner = (
      await queryRows<FunctionOwnerRow>(
        queryRunner,
        `
          SELECT pg_get_userbyid(p.proowner) AS owner
          FROM pg_proc AS p
          WHERE p.oid = '${FUNCTION_SIGNATURE}'::regprocedure
        `,
      )
    )[0];
    if (!functionOwner) {
      throw new Error('0396 down expected the verification function to exist');
    }
    if (functionOwner.owner !== FUNCTION_OWNER) {
      throw new Error(
        `0396 down refuses function owned by ${functionOwner.owner}`,
      );
    }

    const previousMembership = assertMembershipPreflight(
      await readExecutorMembership(queryRunner),
      executor.currentUser,
    );
    let temporaryMembership = false;
    let roleWasSet = false;
    let operationError: unknown = null;

    try {
      if (executor.isSuperuser) {
        await queryRunner.query(`SET ROLE ${FUNCTION_OWNER}`);
        roleWasSet = true;
      } else {
        temporaryMembership = true;
        await establishTemporaryMembership(queryRunner, executor.currentUser);
        await queryRunner.query(`SET ROLE ${FUNCTION_OWNER}`);
        roleWasSet = true;
      }
      await queryRunner.query(`DROP FUNCTION ${FUNCTION_SIGNATURE}`);
    } catch (error) {
      operationError = error;
    }

    const cleanupErrors: Error[] = [];
    if (roleWasSet) {
      try {
        await queryRunner.query('RESET ROLE');
      } catch (error) {
        cleanupErrors.push(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }
    if (operationError || cleanupErrors.length > 0) {
      throwWithCleanup(operationError, cleanupErrors);
    }

    const membershipCleanupErrors = await cleanupTemporaryPrivileges(
      queryRunner,
      {
        temporarySchemaCreate: false,
        temporaryMembership,
        previousMembership,
      },
    );
    if (membershipCleanupErrors.length > 0) {
      throwWithCleanup(null, membershipCleanupErrors);
    }

    await queryRunner.query(`
      REVOKE SELECT ON TABLE public.apr_risk_evidences
        FROM ${FUNCTION_OWNER}
    `);
  }
}
