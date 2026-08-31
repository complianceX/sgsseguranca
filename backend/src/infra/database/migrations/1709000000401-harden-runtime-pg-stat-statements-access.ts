import { MigrationInterface, QueryRunner } from 'typeorm';

const RUNTIME_ROLE = 'sgs_app';
const ADMIN_ROLE = 'sgs_admin';
const EXTENSION_OWNER = 'neondb_owner';
const MIGRATION_EXECUTOR_ROLE = 'neondb_owner';
const MANAGED_RELATION_OWNER = 'cloud_admin';
const MANAGED_ACL_GRANTOR = 'cloud_admin';
const PROVIDER_GRANT_ROLE = 'neon_superuser';
const MONITORING_ROLES = [
  'pg_monitor',
  'pg_read_all_stats',
  'pg_read_all_settings',
  'pg_stat_scan_tables',
  'pg_read_server_files',
  'pg_write_server_files',
  'pg_execute_server_program',
  'pg_signal_backend',
  'pg_read_all_data',
  'pg_write_all_data',
  PROVIDER_GRANT_ROLE,
  MANAGED_RELATION_OWNER,
] as const;
const RELATIONS = [
  'public.pg_stat_statements',
  'public.pg_stat_statements_info',
] as const;

type Row = Record<string, unknown>;

function isTruthy(value: unknown): boolean {
  return value === true || value === 't' || value === 'true';
}

/**
 * Normaliza apenas grants customer-manageable. O SELECT PUBLIC que o Neon
 * mantém nos objetos da extensão é validado como uma restrição gerenciada do
 * provedor; tentar revogá-lo com o owner delegado não altera a ACL e criaria
 * um falso senso de isolamento.
 */
export class HardenRuntimePgStatStatementsAccess1709000000401 implements MigrationInterface {
  name = 'HardenRuntimePgStatStatementsAccess1709000000401';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.isManagedProviderBoundary(queryRunner))) {
      console.info(
        '[0401] skipped: no Neon-managed pg_stat_statements boundary is present',
      );
      return;
    }

    await this.assertRoles(queryRunner);
    await this.assertRuntimePosture(queryRunner);

    const relations = await this.loadRelations(queryRunner);
    await this.assertProviderProvenance(queryRunner, relations);
    await this.assertProviderAclIsCustomerImmutable(queryRunner);

    await this.withGrantCapableRole(queryRunner, async () => {
      await queryRunner.query(
        `REVOKE ALL PRIVILEGES ON TABLE public.pg_stat_statements, public.pg_stat_statements_info FROM ${RUNTIME_ROLE}`,
      );
      await queryRunner.query(
        `REVOKE ALL PRIVILEGES ON TABLE public.pg_stat_statements, public.pg_stat_statements_info FROM ${ADMIN_ROLE}`,
      );
      await queryRunner.query(
        `GRANT SELECT ON TABLE public.pg_stat_statements TO ${ADMIN_ROLE}`,
      );
    });

    await this.assertProviderProvenance(
      queryRunner,
      await this.loadRelations(queryRunner),
    );
    await this.assertRuntimePosture(queryRunner);
    await this.assertNormalizedCustomerAcl(queryRunner);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No-op: rollback automático não deve reabrir observabilidade no runtime.
  }

  private async isManagedProviderBoundary(
    queryRunner: QueryRunner,
  ): Promise<boolean> {
    const rows = (await queryRunner.query(
      `
        SELECT
          EXISTS (
            SELECT 1
            FROM pg_roles
            WHERE rolname = $1
          ) AS managed_role_exists,
          EXISTS (
            SELECT 1
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
              AND c.relname = ANY($2::text[])
              AND pg_get_userbyid(c.relowner) = $1
          ) AS managed_relation_exists
      `,
      [
        MANAGED_RELATION_OWNER,
        RELATIONS.map((value) => value.slice('public.'.length)),
      ],
    )) as Row[];
    return (
      isTruthy(rows[0]?.managed_role_exists) ||
      isTruthy(rows[0]?.managed_relation_exists)
    );
  }

  private async assertRoles(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      `
        SELECT
          EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS runtime_exists,
          EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $2) AS admin_exists
      `,
      [RUNTIME_ROLE, ADMIN_ROLE],
    )) as Row[];
    if (
      !isTruthy(rows[0]?.runtime_exists) ||
      !isTruthy(rows[0]?.admin_exists)
    ) {
      throw new Error('0401 requires sgs_app and sgs_admin roles');
    }
  }

  private async assertRuntimePosture(queryRunner: QueryRunner): Promise<void> {
    const roleRows = (await queryRunner.query(
      `
        WITH RECURSIVE inherited_roles(role_oid) AS (
          SELECT oid FROM pg_roles WHERE rolname = $1
          UNION
          SELECT am.roleid
          FROM pg_auth_members am
          JOIN inherited_roles ir ON ir.role_oid = am.member
          WHERE am.inherit_option
        )
        SELECT
          bool_or(r.rolname = ANY($2::text[])) AS has_privileged_membership,
          bool_or(r.rolsuper) AS is_superuser,
          bool_or(r.rolbypassrls) AS bypass_rls,
          pg_has_role($1::name, $4::name, 'SET') AS can_set_managed_relation_owner,
          EXISTS (
            SELECT 1
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
              AND c.relname = ANY($3::text[])
              AND pg_get_userbyid(c.relowner) = $1
          ) AS owns_relation
        FROM inherited_roles ir
        JOIN pg_roles r ON r.oid = ir.role_oid
      `,
      [
        RUNTIME_ROLE,
        [...MONITORING_ROLES],
        RELATIONS.map((value) => value.slice('public.'.length)),
        MANAGED_RELATION_OWNER,
      ],
    )) as Row[];
    const role = roleRows[0];
    if (
      isTruthy(role?.has_privileged_membership) ||
      isTruthy(role?.is_superuser) ||
      isTruthy(role?.bypass_rls) ||
      isTruthy(role?.can_set_managed_relation_owner) ||
      isTruthy(role?.owns_relation)
    ) {
      if (isTruthy(role?.can_set_managed_relation_owner)) {
        throw new Error('0401 runtime role can SET ROLE cloud_admin');
      }
      throw new Error(
        '0401 runtime role has privileged membership or ownership',
      );
    }
  }

  private async loadRelations(queryRunner: QueryRunner): Promise<Row[]> {
    const rows = (await queryRunner.query(
      `
        SELECT
          c.relname AS relation_name,
          c.relkind,
          pg_get_userbyid(c.relowner) AS owner,
          pg_get_viewdef(c.oid, true) AS view_definition
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = ANY($1::text[])
        ORDER BY c.relname
      `,
      [RELATIONS.map((value) => value.slice('public.'.length))],
    )) as Row[];
    if (rows.length !== RELATIONS.length) {
      throw new Error('0401 requires both pg_stat_statements relations');
    }
    return rows;
  }

  private async assertProviderProvenance(
    queryRunner: QueryRunner,
    relations: Row[],
  ): Promise<void> {
    const extensionRows = (await queryRunner.query(
      `
        SELECT pg_get_userbyid(extowner) AS extension_owner
        FROM pg_extension
        WHERE extname = 'pg_stat_statements'
      `,
    )) as Row[];
    if (extensionRows[0]?.extension_owner !== EXTENSION_OWNER) {
      throw new Error('0401 unexpected extension owner for pg_stat_statements');
    }

    const providerRole = (await queryRunner.query(
      `
        SELECT
          current_user AS current_user,
          pg_has_role(current_user, $1, 'SET') AS can_set_provider_role
      `,
      [MANAGED_RELATION_OWNER],
    )) as Row[];
    if (
      providerRole[0]?.current_user === MANAGED_RELATION_OWNER ||
      isTruthy(providerRole[0]?.can_set_provider_role)
    ) {
      throw new Error('0401 unexpected SET ROLE capability for cloud_admin');
    }
    if (providerRole[0]?.current_user !== MIGRATION_EXECUTOR_ROLE) {
      throw new Error('0401 unexpected migration executor for Neon provider');
    }

    const aclRows = (await queryRunner.query(
      `
        SELECT
          c.relname AS relation_name,
          CASE WHEN acl.grantee = 0 THEN 'PUBLIC'
               ELSE pg_get_userbyid(acl.grantee) END AS grantee,
          pg_get_userbyid(acl.grantor) AS grantor,
          acl.privilege_type,
          acl.is_grantable
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        CROSS JOIN LATERAL aclexplode(c.relacl) AS acl
        WHERE n.nspname = 'public'
          AND c.relname = ANY($1::text[])
        ORDER BY c.relname, grantee, acl.privilege_type
      `,
      [RELATIONS.map((value) => value.slice('public.'.length))],
    )) as Row[];

    for (const relation of relations) {
      const name = String(relation.relation_name);
      if (relation.owner !== MANAGED_RELATION_OWNER) {
        throw new Error(`0401 unexpected ${name} relation owner`);
      }
      if (!relation.view_definition) {
        throw new Error(
          `0401 relation view definition is unavailable for ${name}`,
        );
      }
      const current = aclRows.filter((row) => row.relation_name === name);
      const publicRows = current.filter((row) => row.grantee === 'PUBLIC');
      if (
        publicRows.length !== 1 ||
        publicRows[0]?.privilege_type !== 'SELECT' ||
        publicRows[0]?.grantor !== MANAGED_ACL_GRANTOR ||
        isTruthy(publicRows[0]?.is_grantable)
      ) {
        throw new Error(`0401 unexpected PUBLIC ACL provenance on ${name}`);
      }
      for (const row of current) {
        if (
          row.grantee !== 'PUBLIC' &&
          row.grantee !== RUNTIME_ROLE &&
          row.grantee !== ADMIN_ROLE &&
          row.grantee !== MANAGED_RELATION_OWNER &&
          row.grantee !== PROVIDER_GRANT_ROLE
        ) {
          throw new Error(`0401 unknown ACL grantee on ${name}`);
        }
        if (
          (row.grantee === MANAGED_RELATION_OWNER ||
            row.grantee === PROVIDER_GRANT_ROLE) &&
          row.grantor !== MANAGED_ACL_GRANTOR
        ) {
          throw new Error(`0401 unexpected ACL provenance on ${name}`);
        }
      }
    }
  }

  private async withGrantCapableRole(
    queryRunner: QueryRunner,
    callback: () => Promise<void>,
  ): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT pg_has_role(current_user, $1, 'SET') AS can_set`,
      [PROVIDER_GRANT_ROLE],
    )) as Row[];
    if (!isTruthy(rows[0]?.can_set)) {
      throw new Error(
        '0401 customer-managed grants cannot be normalized safely',
      );
    }
    await queryRunner.query(`SET LOCAL ROLE ${PROVIDER_GRANT_ROLE}`);
    try {
      await callback();
    } finally {
      await queryRunner.query('SET LOCAL ROLE NONE');
    }
  }

  private async assertProviderAclIsCustomerImmutable(
    queryRunner: QueryRunner,
  ): Promise<void> {
    const before = await this.loadProviderPublicAcl(queryRunner);
    await queryRunner.query('SAVEPOINT neon_provider_acl_probe');
    try {
      try {
        await queryRunner.query(
          'REVOKE SELECT ON TABLE public.pg_stat_statements, public.pg_stat_statements_info FROM PUBLIC',
        );
      } catch (error: unknown) {
        const code = (error as { code?: string })?.code;
        if (code !== '42501' && code !== '0A000') {
          throw error;
        }
      }
      const after = await this.loadProviderPublicAcl(queryRunner);
      if (JSON.stringify(after) !== JSON.stringify(before)) {
        throw new Error(
          '0401 customer role can alter provider PUBLIC ACL; refusing to continue',
        );
      }
    } finally {
      await queryRunner.query('ROLLBACK TO SAVEPOINT neon_provider_acl_probe');
      await queryRunner.query('RELEASE SAVEPOINT neon_provider_acl_probe');
    }
  }

  private async loadProviderPublicAcl(
    queryRunner: QueryRunner,
  ): Promise<Row[]> {
    return (await queryRunner.query(
      `
        SELECT
          c.relname AS relation_name,
          pg_get_userbyid(acl.grantor) AS grantor,
          acl.privilege_type,
          acl.is_grantable
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        CROSS JOIN LATERAL aclexplode(c.relacl) AS acl
        WHERE n.nspname = 'public'
          AND c.relname = ANY($1::text[])
          AND acl.grantee = 0
        ORDER BY c.relname, acl.privilege_type
      `,
      [RELATIONS.map((value) => value.slice('public.'.length))],
    )) as Row[];
  }

  private async assertNormalizedCustomerAcl(
    queryRunner: QueryRunner,
  ): Promise<void> {
    const rows = (await queryRunner.query(
      `
        SELECT
          c.relname AS relation_name,
          CASE WHEN acl.grantee = 0 THEN 'PUBLIC'
               ELSE pg_get_userbyid(acl.grantee) END AS grantee,
          acl.privilege_type,
          acl.is_grantable
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        CROSS JOIN LATERAL aclexplode(c.relacl) AS acl
        WHERE n.nspname = 'public'
          AND c.relname = ANY($1::text[])
          AND pg_get_userbyid(acl.grantee) = ANY($2::text[])
        ORDER BY c.relname, grantee, acl.privilege_type
      `,
      [
        RELATIONS.map((value) => value.slice('public.'.length)),
        [RUNTIME_ROLE, ADMIN_ROLE],
      ],
    )) as Row[];
    const runtimeRows = rows.filter((row) => row.grantee === RUNTIME_ROLE);
    const adminRows = rows.filter((row) => row.grantee === ADMIN_ROLE);
    if (runtimeRows.length > 0) {
      throw new Error('0401 direct runtime ACL remains');
    }
    if (
      adminRows.length !== 1 ||
      adminRows[0]?.relation_name !== 'pg_stat_statements' ||
      adminRows[0]?.privilege_type !== 'SELECT' ||
      isTruthy(adminRows[0]?.is_grantable)
    ) {
      throw new Error('0401 admin ACL is not normalized to SELECT only');
    }
  }
}
