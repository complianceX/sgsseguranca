const path = require('path');
const dotenv = require('dotenv');
const { connectRuntimePgClient } = require('./lib/pg-runtime-client');

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function parseCliArgs(argv) {
  const args = {
    strict: false,
    sampleLimit: 25,
  };

  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    if (body === 'strict') {
      args.strict = true;
      continue;
    }
    const [key, rawValue] = body.split('=');
    if (key === 'sample-limit') {
      const numeric = Number(rawValue);
      if (Number.isFinite(numeric) && numeric > 0) {
        args.sampleLimit = Math.min(Math.trunc(numeric), 200);
      }
    }
  }

  return args;
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  let connection;

  try {
    connection = await connectRuntimePgClient();
    const client = connection.client;

    await client.query('BEGIN');
    await client.query('SET LOCAL TRANSACTION READ ONLY');
    await client.query("SELECT set_config('app.is_super_admin', 'true', true)");

    const rolesResult = await client.query(
      `SELECT name
       FROM public.roles
       ORDER BY name ASC`,
    );

    const summaryResult = await client.query(`
      WITH normalized AS (
        SELECT
          u.id AS user_id,
          u.email,
          p.nome AS profile_name,
          CASE
            WHEN lower(trim(p.nome)) IN ('super_admin', 'admin_geral', 'administrador geral') THEN 'Administrador Geral'
            WHEN lower(trim(p.nome)) IN ('admin_empresa', 'admin empresa', 'administrador empresa', 'administrador da empresa') THEN 'Administrador da Empresa'
            WHEN lower(trim(p.nome)) IN (
              'tecnico',
              'tecnico sst',
              'tecnico de seguranca do trabalho',
              'tecnico de seguranca do trabalho (tst)',
              'tst',
              'técnico',
              'técnico sst',
              'técnico de segurança do trabalho',
              'técnico de segurança do trabalho (tst)'
            ) THEN 'Técnico de Segurança do Trabalho (TST)'
            WHEN lower(trim(p.nome)) IN ('supervisor', 'supervisor / encarregado') THEN 'Supervisor / Encarregado'
            WHEN lower(trim(p.nome)) = 'visualizador' THEN 'Trabalhador'
            WHEN lower(trim(p.nome)) IN ('colaborador', 'operador / colaborador') THEN 'Operador / Colaborador'
            WHEN lower(trim(p.nome)) = 'trabalhador' THEN 'Trabalhador'
            WHEN lower(trim(p.nome)) = 'gerente' THEN 'GERENTE'
            ELSE trim(p.nome)
          END AS expected_role
        FROM public.users u
        JOIN public.profiles p ON p.id = u.profile_id
        WHERE u.deleted_at IS NULL
      )
      SELECT
        n.profile_name,
        n.expected_role,
        COUNT(*)::int AS users_total,
        COUNT(*) FILTER (WHERE role_expected.id IS NULL)::int AS expected_role_not_in_roles_table,
        COUNT(*) FILTER (WHERE ur_match.user_id IS NOT NULL)::int AS users_with_expected_role,
        COUNT(*) FILTER (WHERE ur_match.user_id IS NULL)::int AS users_missing_expected_role,
        COUNT(*) FILTER (WHERE ur_any.user_id IS NULL)::int AS users_without_any_user_role
      FROM normalized n
      LEFT JOIN public.roles role_expected
        ON role_expected.name = n.expected_role
      LEFT JOIN public.user_roles ur_match
        ON ur_match.user_id = n.user_id
       AND ur_match.role_id = role_expected.id
      LEFT JOIN LATERAL (
        SELECT ur.user_id
        FROM public.user_roles ur
        WHERE ur.user_id = n.user_id
        LIMIT 1
      ) ur_any ON TRUE
      GROUP BY n.profile_name, n.expected_role
      ORDER BY users_missing_expected_role DESC, n.profile_name ASC
    `);

    const missingSampleResult = await client.query(
      `
      WITH normalized AS (
        SELECT
          u.id AS user_id,
          u.email,
          p.nome AS profile_name,
          CASE
            WHEN lower(trim(p.nome)) IN ('super_admin', 'admin_geral', 'administrador geral') THEN 'Administrador Geral'
            WHEN lower(trim(p.nome)) IN ('admin_empresa', 'admin empresa', 'administrador empresa', 'administrador da empresa') THEN 'Administrador da Empresa'
            WHEN lower(trim(p.nome)) IN (
              'tecnico',
              'tecnico sst',
              'tecnico de seguranca do trabalho',
              'tecnico de seguranca do trabalho (tst)',
              'tst',
              'técnico',
              'técnico sst',
              'técnico de segurança do trabalho',
              'técnico de segurança do trabalho (tst)'
            ) THEN 'Técnico de Segurança do Trabalho (TST)'
            WHEN lower(trim(p.nome)) IN ('supervisor', 'supervisor / encarregado') THEN 'Supervisor / Encarregado'
            WHEN lower(trim(p.nome)) = 'visualizador' THEN 'Trabalhador'
            WHEN lower(trim(p.nome)) IN ('colaborador', 'operador / colaborador') THEN 'Operador / Colaborador'
            WHEN lower(trim(p.nome)) = 'trabalhador' THEN 'Trabalhador'
            WHEN lower(trim(p.nome)) = 'gerente' THEN 'GERENTE'
            ELSE trim(p.nome)
          END AS expected_role
        FROM public.users u
        JOIN public.profiles p ON p.id = u.profile_id
        WHERE u.deleted_at IS NULL
      )
      SELECT
        n.user_id,
        n.email,
        n.profile_name,
        n.expected_role,
        (role_expected.id IS NOT NULL) AS expected_role_exists,
        COALESCE(
          (
            SELECT array_agg(r2.name ORDER BY r2.name)
            FROM public.user_roles ur2
            JOIN public.roles r2 ON r2.id = ur2.role_id
            WHERE ur2.user_id = n.user_id
          ),
          ARRAY[]::text[]
        ) AS actual_roles
      FROM normalized n
      LEFT JOIN public.roles role_expected
        ON role_expected.name = n.expected_role
      LEFT JOIN public.user_roles ur_match
        ON ur_match.user_id = n.user_id
       AND ur_match.role_id = role_expected.id
      WHERE ur_match.user_id IS NULL
      ORDER BY n.profile_name ASC, n.user_id ASC
      LIMIT $1
      `,
      [options.sampleLimit],
    );

    await client.query('ROLLBACK');

    const summary = summaryResult.rows.map((row) => ({
      profileName: row.profile_name,
      expectedRole: row.expected_role,
      usersTotal: Number(row.users_total || 0),
      expectedRoleNotInRolesTable: Number(
        row.expected_role_not_in_roles_table || 0,
      ),
      usersWithExpectedRole: Number(row.users_with_expected_role || 0),
      usersMissingExpectedRole: Number(row.users_missing_expected_role || 0),
      usersWithoutAnyUserRole: Number(row.users_without_any_user_role || 0),
    }));

    const totals = summary.reduce(
      (acc, item) => {
        acc.usersTotal += item.usersTotal;
        acc.usersMissingExpectedRole += item.usersMissingExpectedRole;
        acc.usersWithoutAnyUserRole += item.usersWithoutAnyUserRole;
        acc.expectedRoleNotInRolesTable += item.expectedRoleNotInRolesTable;
        return acc;
      },
      {
        usersTotal: 0,
        usersMissingExpectedRole: 0,
        usersWithoutAnyUserRole: 0,
        expectedRoleNotInRolesTable: 0,
      },
    );

    const focusGerenteVisualizador = summary.filter((item) => {
      const normalized = String(item.profileName || '').trim().toLowerCase();
      return normalized === 'gerente' || normalized === 'visualizador';
    });

    const status =
      totals.usersMissingExpectedRole > 0 ||
      totals.usersWithoutAnyUserRole > 0 ||
      totals.expectedRoleNotInRolesTable > 0
        ? 'drift_detected'
        : 'ok';

    const report = {
      version: 1,
      type: 'rbac_profile_role_drift_audit',
      generatedAt: new Date().toISOString(),
      status,
      runtimeDbSource: connection.databaseConfig?.source || null,
      strict: options.strict,
      rolesCatalog: rolesResult.rows.map((row) => row.name),
      totals,
      focusGerenteVisualizador,
      summary,
      missingSample: missingSampleResult.rows,
    };

    console.log(JSON.stringify(report, null, 2));

    if (options.strict && status !== 'ok') {
      process.exitCode = 1;
    }
  } catch (error) {
    if (connection?.client) {
      try {
        await connection.client.query('ROLLBACK');
      } catch {
        // noop
      }
    }

    console.error(
      '[RBAC:PROFILE-ROLE:DRIFT] Failed:',
      error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
  } finally {
    if (connection?.client) {
      await connection.client.end().catch(() => undefined);
    }
  }
}

main();
