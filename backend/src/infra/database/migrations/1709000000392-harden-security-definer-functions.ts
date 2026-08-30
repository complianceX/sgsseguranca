import { MigrationInterface, QueryRunner } from 'typeorm';

type RoleIdentityRow = {
  current_user: string;
  session_user: string;
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
  set_memberships: string;
  inherit_memberships: string;
};

type FunctionOwnershipRow = {
  expected_count: string;
  existing_count: string;
  owned_count: string;
};

function rowsOf<T>(result: unknown): T[] {
  return Array.isArray(result) ? (result as T[]) : [];
}

function booleanValue(value: unknown): boolean {
  return value === true || value === 't' || value === 'true';
}

function optionLiteral(value: boolean): 'TRUE' | 'FALSE' {
  return value ? 'TRUE' : 'FALSE';
}

/**
 * BE-011 — hardening das funções SECURITY DEFINER.
 *
 * As funções de autenticação e validação pública precisam atravessar RLS em
 * pontos muito específicos, mas não devem ser propriedade do superusuário de
 * migração nem resolver objetos por search_path controlável. O owner dedicado
 * é NOLOGIN, não é superusuário e recebe somente os privilégios de leitura e
 * atualização necessários às cinco funções aprovadas.
 */
export class HardenSecurityDefinerFunctions1709000000392 implements MigrationInterface {
  name = 'HardenSecurityDefinerFunctions1709000000392';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const identity = rowsOf<RoleIdentityRow>(
      await queryRunner.query(`SELECT current_user, session_user`),
    )[0];

    if (!identity?.current_user || !identity.session_user) {
      throw new Error('0392 could not identify the migration executor');
    }
    if (
      identity.current_user === 'sgs_app' ||
      identity.session_user === 'sgs_app'
    ) {
      throw new Error('0392 cannot run with the runtime role sgs_app');
    }

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_roles WHERE rolname = 'sgs_function_owner'
        ) THEN
          CREATE ROLE sgs_function_owner
            NOLOGIN
            NOSUPERUSER
            NOCREATEDB
            NOCREATEROLE
            NOINHERIT
            BYPASSRLS;
        ELSE
          ALTER ROLE sgs_function_owner
            NOLOGIN
            NOSUPERUSER
            NOCREATEDB
            NOCREATEROLE
            NOINHERIT
            BYPASSRLS;
        END IF;
      END $$;
    `);

    const membershipsBefore = rowsOf<RoleMembershipRow>(
      await queryRunner.query(`
        SELECT
          grantor.rolname AS grantor,
          am.admin_option,
          am.inherit_option,
          am.set_option
        FROM pg_auth_members AS am
        JOIN pg_roles AS granted_role ON granted_role.oid = am.roleid
        JOIN pg_roles AS member_role ON member_role.oid = am.member
        JOIN pg_roles AS grantor ON grantor.oid = am.grantor
        WHERE granted_role.rolname = 'sgs_function_owner'
          AND member_role.rolname = current_user
      `),
    );
    const membershipsByExecutor = membershipsBefore.filter(
      (membership) => membership.grantor === identity.current_user,
    );

    if (membershipsByExecutor.length > 1) {
      throw new Error(
        '0392 found multiple executor grants for sgs_function_owner',
      );
    }
    if (
      membershipsBefore.some((membership) =>
        booleanValue(membership.set_option),
      )
    ) {
      throw new Error(
        '0392 found a pre-existing SET-capable membership for sgs_function_owner',
      );
    }
    if (
      membershipsBefore.some((membership) =>
        booleanValue(membership.inherit_option),
      )
    ) {
      throw new Error(
        '0392 found a pre-existing INHERIT membership for sgs_function_owner',
      );
    }

    const previousExecutorMembership = membershipsByExecutor[0];
    const temporaryMembership = true;
    // Do not force GRANTED BY CURRENT_USER here. PostgreSQL 17 permits a
    // CREATEROLE executor to grant a non-superuser role, but an explicit
    // grantor must already hold ADMIN on that role. The unqualified form
    // lets PostgreSQL apply the executor's actual grantor semantics.
    await queryRunner.query(`
      GRANT sgs_function_owner TO CURRENT_USER
        WITH SET TRUE, INHERIT FALSE
    `);

    const membershipAfterGrant = rowsOf<RoleMembershipRow>(
      await queryRunner.query(`
        SELECT
          grantor.rolname AS grantor,
          am.admin_option,
          am.inherit_option,
          am.set_option
        FROM pg_auth_members AS am
        JOIN pg_roles AS granted_role ON granted_role.oid = am.roleid
        JOIN pg_roles AS member_role ON member_role.oid = am.member
        JOIN pg_roles AS grantor ON grantor.oid = am.grantor
        WHERE granted_role.rolname = 'sgs_function_owner'
          AND member_role.rolname = current_user
      `),
    );
    if (
      !membershipAfterGrant.some(
        (membership) =>
          membership.grantor === identity.current_user &&
          booleanValue(membership.set_option) &&
          !booleanValue(membership.inherit_option),
      )
    ) {
      throw new Error('0392 could not establish temporary SET capability');
    }

    const schemaPrivilege = rowsOf<{ has_create: boolean }>(
      await queryRunner.query(`
        SELECT has_schema_privilege(
          'sgs_function_owner', 'public', 'CREATE'
        ) AS has_create
      `),
    )[0];
    if (booleanValue(schemaPrivilege?.has_create)) {
      throw new Error(
        '0392 found pre-existing CREATE privilege for sgs_function_owner',
      );
    }
    const temporarySchemaCreate = true;
    await queryRunner.query(`
      GRANT CREATE ON SCHEMA public
        TO sgs_function_owner
    `);
    const schemaAfterGrant = rowsOf<{ has_create: boolean }>(
      await queryRunner.query(`
        SELECT has_schema_privilege(
          'sgs_function_owner', 'public', 'CREATE'
        ) AS has_create
      `),
    )[0];
    if (!booleanValue(schemaAfterGrant?.has_create)) {
      throw new Error('0392 could not establish temporary schema CREATE');
    }

    await queryRunner.query(
      `GRANT USAGE ON SCHEMA public TO sgs_function_owner`,
    );
    await queryRunner.query(`
      GRANT SELECT ON TABLE
        public.users,
        public.profiles,
        public.user_sites,
        public.signatures
      TO sgs_function_owner
    `);
    await queryRunner.query(`
      GRANT UPDATE (password, must_change_password)
      ON TABLE public.users TO sgs_function_owner
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.find_login_user(
        p_cpf_hash text,
        p_cpf_legacy text DEFAULT NULL
      )
      RETURNS TABLE (
        id uuid,
        nome character varying,
        cpf character varying,
        cpf_ciphertext text,
        email character varying,
        funcao character varying,
        password character varying,
        auth_user_id uuid,
        company_id uuid,
        site_id uuid,
        profile_id uuid,
        status boolean,
        must_change_password boolean,
        profile_nome character varying
      )
      LANGUAGE sql
      SECURITY DEFINER
      SET search_path = pg_catalog, public, pg_temp
      AS $$
        SELECT
          u.id,
          u.nome,
          u.cpf,
          u.cpf_ciphertext,
          u.email,
          u.funcao,
          u.password,
          u.auth_user_id,
          u.company_id,
          u.site_id,
          u.profile_id,
          u.status,
          u.must_change_password,
          p.nome AS profile_nome
        FROM public.users AS u
        LEFT JOIN public.profiles AS p ON p.id = u.profile_id
        WHERE (
          u.cpf_hash = p_cpf_hash
          OR (p_cpf_legacy IS NOT NULL AND u.cpf = p_cpf_legacy)
        )
          AND u.deleted_at IS NULL
        LIMIT 1;
      $$;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.update_login_user_password_hash(
        p_user_id uuid,
        p_new_hash text
      )
      RETURNS void
      LANGUAGE sql
      SECURITY DEFINER
      SET search_path = pg_catalog, public, pg_temp
      AS $$
        UPDATE public.users AS u
        SET password = p_new_hash
        WHERE u.id = p_user_id
          AND u.deleted_at IS NULL;
      $$;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.find_user_bridge(
        p_app_user_id uuid DEFAULT NULL,
        p_auth_user_id uuid DEFAULT NULL
      )
      RETURNS TABLE (
        id uuid,
        auth_user_id uuid,
        cpf character varying,
        cpf_ciphertext text,
        company_id uuid,
        site_id uuid,
        site_ids uuid[],
        profile_nome character varying
      )
      LANGUAGE sql
      SECURITY DEFINER
      SET search_path = pg_catalog, public, pg_temp
      AS $$
        SELECT
          u.id,
          u.auth_user_id,
          u.cpf,
          u.cpf_ciphertext,
          u.company_id,
          u.site_id,
          COALESCE(
            ARRAY_AGG(us.site_id ORDER BY us.created_at)
              FILTER (WHERE us.site_id IS NOT NULL),
            ARRAY[]::uuid[]
          ) AS site_ids,
          p.nome AS profile_nome
        FROM public.users AS u
        LEFT JOIN public.profiles AS p ON p.id = u.profile_id
        LEFT JOIN public.user_sites AS us
          ON us.user_id = u.id
         AND us.company_id = u.company_id
        WHERE u.status = true
          AND u.deleted_at IS NULL
          AND (
            (p_auth_user_id IS NOT NULL AND u.auth_user_id = p_auth_user_id)
            OR (p_app_user_id IS NOT NULL AND u.id = p_app_user_id)
          )
        GROUP BY
          u.id, u.auth_user_id, u.cpf, u.cpf_ciphertext,
          u.company_id, u.site_id, p.nome
        ORDER BY
          CASE
            WHEN p_auth_user_id IS NOT NULL AND u.auth_user_id = p_auth_user_id
              THEN 0
            ELSE 1
          END
        LIMIT 1;
      $$;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.reset_login_user_password(
        p_user_id uuid,
        p_new_hash text
      )
      RETURNS TABLE (user_id uuid, company_id uuid)
      LANGUAGE sql
      SECURITY DEFINER
      SET search_path = pg_catalog, public, pg_temp
      AS $$
        UPDATE public.users AS u
        SET password = p_new_hash,
            must_change_password = false
        WHERE u.id = p_user_id
          AND u.deleted_at IS NULL
        RETURNING u.id, u.company_id;
      $$;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.verify_signature_by_hash_public(
        p_hash text
      )
      RETURNS TABLE (
        signature_hash text,
        signed_at timestamptz,
        timestamp_authority text,
        type text,
        timestamp_token text,
        integrity_payload jsonb
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
          s.integrity_payload
        FROM public.signatures AS s
        WHERE s.signature_hash = p_hash
          AND s.deleted_at IS NULL
        LIMIT 1;
      END;
      $$;
    `);

    // The migration executor still owns the freshly created functions here.
    // Revoke the default PUBLIC EXECUTE before ownership transfer; after the
    // transfer PostgreSQL no longer treats the executor as their owner.
    await queryRunner.query(`
      REVOKE EXECUTE ON FUNCTION
        public.find_login_user(text, text),
        public.update_login_user_password_hash(uuid, text),
        public.find_user_bridge(uuid, uuid),
        public.reset_login_user_password(uuid, text),
        public.verify_signature_by_hash_public(text)
      FROM PUBLIC, sgs_admin
    `);
    await queryRunner.query(`
      GRANT EXECUTE ON FUNCTION
        public.find_login_user(text, text),
        public.update_login_user_password_hash(uuid, text),
        public.find_user_bridge(uuid, uuid),
        public.reset_login_user_password(uuid, text),
        public.verify_signature_by_hash_public(text)
      TO sgs_app
    `);

    for (const statement of [
      `ALTER FUNCTION public.find_login_user(text, text) OWNER TO sgs_function_owner`,
      `ALTER FUNCTION public.update_login_user_password_hash(uuid, text) OWNER TO sgs_function_owner`,
      `ALTER FUNCTION public.find_user_bridge(uuid, uuid) OWNER TO sgs_function_owner`,
      `ALTER FUNCTION public.reset_login_user_password(uuid, text) OWNER TO sgs_function_owner`,
      `ALTER FUNCTION public.verify_signature_by_hash_public(text) OWNER TO sgs_function_owner`,
    ]) {
      await queryRunner.query(statement);
    }

    await queryRunner.query(`
      REVOKE EXECUTE ON FUNCTION
        public.gdpr_delete_user_data(uuid),
        public.cleanup_expired_data()
      FROM PUBLIC, sgs_app
    `);
    await queryRunner.query(`
      GRANT EXECUTE ON FUNCTION
        public.gdpr_delete_user_data(uuid),
        public.cleanup_expired_data()
      TO sgs_admin
    `);

    for (const role of ['sgs_migrator', 'neondb_owner']) {
      await queryRunner.query(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN
            EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE ${role} IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM sgs_app';
          END IF;
        END $$;
      `);
    }

    // Reaplica somente o contrato de funções que o runtime realmente usa.
    for (const statement of [
      `GRANT EXECUTE ON FUNCTION public.current_company() TO sgs_app`,
      `GRANT EXECUTE ON FUNCTION public.is_super_admin() TO sgs_app`,
      `GRANT EXECUTE ON FUNCTION public.current_user_role() TO sgs_app`,
      `GRANT EXECUTE ON FUNCTION public.current_app_user_id() TO sgs_app`,
      `GRANT EXECUTE ON FUNCTION public.current_site_id() TO sgs_app`,
      `GRANT EXECUTE ON FUNCTION public.current_site_scope() TO sgs_app`,
      `GRANT EXECUTE ON FUNCTION public.current_site_ids() TO sgs_app`,
      `GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO sgs_app`,
      `GRANT EXECUTE ON FUNCTION public.try_parse_uuid(text) TO sgs_app`,
    ]) {
      await queryRunner.query(statement);
    }

    if (temporarySchemaCreate) {
      await queryRunner.query(`
        REVOKE CREATE ON SCHEMA public
          FROM sgs_function_owner
      `);
    }
    if (temporaryMembership) {
      if (previousExecutorMembership) {
        await queryRunner.query(`
          GRANT sgs_function_owner TO CURRENT_USER
            WITH ADMIN ${optionLiteral(booleanValue(previousExecutorMembership.admin_option))},
                 INHERIT ${optionLiteral(booleanValue(previousExecutorMembership.inherit_option))},
                 SET ${optionLiteral(booleanValue(previousExecutorMembership.set_option))}
        `);
      } else {
        await queryRunner.query(`
          REVOKE sgs_function_owner
            FROM CURRENT_USER
        `);
      }
    }

    const roleContract = rowsOf<RoleContractRow>(
      await queryRunner.query(`
        SELECT
          r.rolcanlogin,
          r.rolsuper,
          r.rolcreatedb,
          r.rolcreaterole,
          r.rolinherit,
          r.rolbypassrls,
          has_schema_privilege(
            'sgs_function_owner', 'public', 'USAGE'
          ) AS schema_usage,
          has_schema_privilege(
            'sgs_function_owner', 'public', 'CREATE'
          ) AS schema_create,
          EXISTS (
            SELECT 1
            FROM pg_auth_members AS app_membership
            JOIN pg_roles AS app_role ON app_role.oid = app_membership.member
            JOIN pg_roles AS owner_role ON owner_role.oid = app_membership.roleid
            WHERE app_role.rolname = 'sgs_app'
              AND owner_role.rolname = 'sgs_function_owner'
          ) AS app_member,
          (
            SELECT count(*)::text
            FROM pg_auth_members AS set_membership
            JOIN pg_roles AS set_role ON set_role.oid = set_membership.roleid
            WHERE set_role.rolname = 'sgs_function_owner'
              AND set_membership.set_option
          ) AS set_memberships,
          (
            SELECT count(*)::text
            FROM pg_auth_members AS inherit_membership
            JOIN pg_roles AS inherit_role ON inherit_role.oid = inherit_membership.roleid
            WHERE inherit_role.rolname = 'sgs_function_owner'
              AND inherit_membership.inherit_option
          ) AS inherit_memberships
        FROM pg_roles AS r
        WHERE r.rolname = 'sgs_function_owner'
      `),
    )[0];
    if (
      !roleContract ||
      booleanValue(roleContract.rolcanlogin) ||
      booleanValue(roleContract.rolsuper) ||
      booleanValue(roleContract.rolcreatedb) ||
      booleanValue(roleContract.rolcreaterole) ||
      booleanValue(roleContract.rolinherit) ||
      !booleanValue(roleContract.rolbypassrls) ||
      !booleanValue(roleContract.schema_usage) ||
      booleanValue(roleContract.schema_create) ||
      booleanValue(roleContract.app_member) ||
      Number(roleContract.set_memberships) !== 0 ||
      Number(roleContract.inherit_memberships) !== 0
    ) {
      throw new Error('0392 final role or temporary privilege contract failed');
    }

    const functionOwnership = rowsOf<FunctionOwnershipRow>(
      await queryRunner.query(`
        SELECT
          count(*)::text AS expected_count,
          count(p.oid)::text AS existing_count,
          count(*) FILTER (WHERE p.proowner = owner_role.oid)::text AS owned_count
        FROM (
          VALUES
            ('public.find_login_user(text, text)'::regprocedure),
            ('public.update_login_user_password_hash(uuid, text)'::regprocedure),
            ('public.find_user_bridge(uuid, uuid)'::regprocedure),
            ('public.reset_login_user_password(uuid, text)'::regprocedure),
            ('public.verify_signature_by_hash_public(text)'::regprocedure)
        ) AS expected(signature)
        LEFT JOIN pg_proc AS p ON p.oid = expected.signature
        CROSS JOIN (
          SELECT oid FROM pg_roles WHERE rolname = 'sgs_function_owner'
        ) AS owner_role
      `),
    )[0];
    if (
      !functionOwnership ||
      Number(functionOwnership.expected_count) !== 5 ||
      Number(functionOwnership.existing_count) !== 5 ||
      Number(functionOwnership.owned_count) !== 5
    ) {
      throw new Error('0392 final SECURITY DEFINER ownership contract failed');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const statement of [
      `ALTER FUNCTION public.find_login_user(text, text) OWNER TO sgs_migrator`,
      `ALTER FUNCTION public.update_login_user_password_hash(uuid, text) OWNER TO sgs_migrator`,
      `ALTER FUNCTION public.find_user_bridge(uuid, uuid) OWNER TO sgs_migrator`,
      `ALTER FUNCTION public.reset_login_user_password(uuid, text) OWNER TO sgs_migrator`,
      `ALTER FUNCTION public.verify_signature_by_hash_public(text) OWNER TO sgs_migrator`,
      `REVOKE EXECUTE ON FUNCTION public.find_login_user(text, text), public.update_login_user_password_hash(uuid, text), public.find_user_bridge(uuid, uuid), public.reset_login_user_password(uuid, text), public.verify_signature_by_hash_public(text) FROM sgs_app`,
      `GRANT EXECUTE ON FUNCTION public.find_login_user(text, text), public.update_login_user_password_hash(uuid, text), public.find_user_bridge(uuid, uuid), public.reset_login_user_password(uuid, text), public.verify_signature_by_hash_public(text) TO sgs_app`,
    ]) {
      await queryRunner.query(statement);
    }

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sgs_function_owner') THEN
          DROP OWNED BY sgs_function_owner;
          DROP ROLE sgs_function_owner;
        END IF;
      END $$;
    `);
  }
}
