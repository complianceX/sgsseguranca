const path = require('path');
const dotenv = require('dotenv');
const { connectRuntimePgClient } = require('./lib/pg-runtime-client');

const CRITICAL_FORCE_RLS_TABLES = new Set([
  'users',
  'expense_reports',
  'expense_advances',
  'expense_items',
  'signatures',
  'tenant_document_policies',
  'privacy_requests',
  'privacy_request_events',
  'medical_exams',
  'trainings',
]);

const DISALLOWED_RUNTIME_TABLE_PRIVILEGES = new Set([
  'TRIGGER',
  'REFERENCES',
  'TRUNCATE',
]);

function normalizePolicyExpression(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function expressionIncludesTenantIsolation(value) {
  const normalized = normalizePolicyExpression(value);
  const hasTenantContext =
    normalized.includes('current_company()') ||
    normalized.includes("current_setting('app.current_company_id'") ||
    normalized.includes("current_setting('app.current_company_id',");
  const hasSuperAdminContext =
    normalized.includes('is_super_admin()') ||
    normalized.includes("current_setting('app.is_super_admin'") ||
    normalized.includes("current_setting('app.is_super_admin',");
  return hasTenantContext && hasSuperAdminContext;
}

function isCommandCovered(policy, command) {
  const cmd = String(policy?.cmd || '').toUpperCase();
  return cmd === 'ALL' || cmd === command;
}

function resolveTenantIsolationPolicyCoverage(policyRows) {
  const emptyCoverage = {
    select: false,
    insert: false,
    update: false,
    delete: false,
    complete: false,
  };

  if (!Array.isArray(policyRows) || policyRows.length === 0) {
    return emptyCoverage;
  }

  const selectOk = policyRows.some(
    (policy) =>
      isCommandCovered(policy, 'SELECT') &&
      expressionIncludesTenantIsolation(policy.qual),
  );
  const deleteOk = policyRows.some(
    (policy) =>
      isCommandCovered(policy, 'DELETE') &&
      expressionIncludesTenantIsolation(policy.qual),
  );
  const insertOk = policyRows.some(
    (policy) =>
      isCommandCovered(policy, 'INSERT') &&
      expressionIncludesTenantIsolation(policy.with_check),
  );
  const updateOk = policyRows.some(
    (policy) =>
      isCommandCovered(policy, 'UPDATE') &&
      expressionIncludesTenantIsolation(policy.qual) &&
      expressionIncludesTenantIsolation(policy.with_check),
  );

  return {
    select: selectOk,
    insert: insertOk,
    update: updateOk,
    delete: deleteOk,
    complete: selectOk && deleteOk && insertOk && updateOk,
  };
}

function parseCliArgs(argv) {
  const options = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const [key, value] = token.slice(2).split('=');
    options[key] = value === undefined ? true : value;
  }
  return options;
}

async function tableExists(client, tableName) {
  const result = await client.query('SELECT to_regclass($1) AS regclass', [
    `public.${tableName}`,
  ]);
  return Boolean(result.rows[0]?.regclass);
}

async function fetchScalar(client, sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows[0] || {};
}

async function runCheck() {
  const { client, databaseConfig } = await connectRuntimePgClient();
  const findings = [];
  const warnings = [];
  const checks = {};

  try {
    await client.query('BEGIN READ ONLY');
    await client.query(`SELECT set_config('app.is_super_admin', 'true', true)`);

    checks.identity = await fetchScalar(
      client,
      `
        SELECT
          current_database() AS database,
          current_user,
          session_user
      `,
    );

    checks.runtimeRole = await fetchScalar(
      client,
      `
        SELECT
          rolname,
          rolsuper,
          rolbypassrls,
          rolcreaterole,
          rolcreatedb,
          rolreplication
        FROM pg_roles
        WHERE rolname = current_user
      `,
    );

    if (
      checks.runtimeRole.rolsuper ||
      checks.runtimeRole.rolbypassrls ||
      checks.runtimeRole.rolcreaterole ||
      checks.runtimeRole.rolcreatedb ||
      checks.runtimeRole.rolreplication
    ) {
      findings.push(
        'Role runtime possui privilegio administrativo ou BYPASSRLS.',
      );
    }

    checks.contextFunctions = (
      await client.query(
        `
        SELECT
          p.proname,
          COALESCE(p.proconfig::text, '') AS config
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = ANY($1::text[])
        ORDER BY p.proname
      `,
        [
          [
            'current_company',
            'is_super_admin',
            'current_app_user_id',
            'current_site_id',
            'current_site_scope',
          ],
        ],
      )
    ).rows;

    for (const fn of checks.contextFunctions) {
      if (!String(fn.config).includes('search_path=public')) {
        findings.push(`Funcao RLS sem search_path=public: ${fn.proname}.`);
      }
    }

    if (await tableExists(client, 'user_sites')) {
      checks.userSitesPolicy = (
        await client.query(`
          SELECT
            policyname,
            cmd,
            qual,
            with_check
          FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename = 'user_sites'
          ORDER BY policyname
        `)
      ).rows;

      const tenantPolicy = checks.userSitesPolicy.find(
        (policy) => policy.policyname === 'tenant_isolation_policy',
      );
      const policyText = `${tenantPolicy?.qual || ''} ${
        tenantPolicy?.with_check || ''
      }`;

      if (!tenantPolicy) {
        findings.push('Policy tenant_isolation_policy ausente em user_sites.');
      } else if (
        !policyText.includes('current_company()') ||
        !policyText.includes('is_super_admin()')
      ) {
        findings.push(
          'Policy user_sites nao usa current_company()/is_super_admin() padronizados.',
        );
      }

      checks.userSitesIndexes = (
        await client.query(`
          SELECT indexname
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename = 'user_sites'
          ORDER BY indexname
        `)
      ).rows.map((row) => row.indexname);

      if (!checks.userSitesIndexes.includes('IDX_user_sites_site')) {
        findings.push('Indice IDX_user_sites_site ausente.');
      }
    }

    const expectedIndexes = [
      ['expense_advances', 'IDX_expense_advances_created_by'],
      ['expense_items', 'IDX_expense_items_created_by'],
      ['expense_reports', 'IDX_expense_reports_closed_by'],
      ['expense_reports', 'IDX_expense_reports_responsible'],
      ['expense_reports', 'IDX_expense_reports_site'],
    ];

    checks.expectedIndexes = [];
    for (const [tableName, indexName] of expectedIndexes) {
      if (!(await tableExists(client, tableName))) {
        warnings.push(
          `Tabela ${tableName} ausente; indice ${indexName} ignorado.`,
        );
        continue;
      }
      const exists = await fetchScalar(
        client,
        `
          SELECT EXISTS (
            SELECT 1
            FROM pg_indexes
            WHERE schemaname = 'public'
              AND tablename = $1
              AND indexname = $2
          ) AS exists
        `,
        [tableName, indexName],
      );
      checks.expectedIndexes.push({
        tableName,
        indexName,
        exists: exists.exists,
      });
      if (!exists.exists) {
        findings.push(`Indice esperado ausente: ${tableName}.${indexName}.`);
      }
    }

    if (await tableExists(client, 'users')) {
      checks.usersSensitiveData = await fetchScalar(
        client,
        `
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE cpf IS NOT NULL AND btrim(cpf) <> '')::int
              AS cpf_plaintext,
            COUNT(*) FILTER (
              WHERE cpf_ciphertext IS NOT NULL AND btrim(cpf_ciphertext) <> ''
            )::int AS cpf_ciphertext
          FROM users
        `,
      );

      if (Number(checks.usersSensitiveData.cpf_plaintext || 0) > 0) {
        warnings.push(
          'CPF plaintext ainda existe em users; exige remediacao planejada sem apagar dados automaticamente.',
        );
      }
    }

    // RLS gate: impede que novas tabelas com company_id existam sem RLS+policy.
    const tablePolicies = (
      await client.query(`
        SELECT
          tablename AS table_name,
          policyname,
          cmd,
          qual,
          with_check
        FROM pg_policies
        WHERE schemaname = 'public'
        ORDER BY tablename, policyname
      `)
    ).rows;

    const policiesByTable = new Map();
    for (const policy of tablePolicies) {
      const tableName = String(policy.table_name || '');
      const current = policiesByTable.get(tableName) || [];
      current.push(policy);
      policiesByTable.set(tableName, current);
    }

    checks.rlsCoverageCompanyId = (
      await client.query(`
        SELECT
          c.relname AS table_name,
          c.relrowsecurity AS rls_enabled,
          c.relforcerowsecurity AS rls_forced
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
          AND a.attname = 'company_id'
          AND a.attisdropped = false
        ORDER BY c.relname
      `)
    ).rows;

    for (const row of checks.rlsCoverageCompanyId) {
      const policyRows = policiesByTable.get(row.table_name) || [];
      const policyCoverage = resolveTenantIsolationPolicyCoverage(policyRows);
      const hasTenantPolicy = policyCoverage.complete;
      row.policy_names = policyRows.map((policy) => policy.policyname);
      row.policy_coverage = policyCoverage;
      row.has_tenant_policy = hasTenantPolicy;

      if (!row.rls_enabled || !hasTenantPolicy) {
        findings.push(
          `Tabela public.${row.table_name} com company_id sem RLS/policy tenant completa (select=${policyCoverage.select} insert=${policyCoverage.insert} update=${policyCoverage.update} delete=${policyCoverage.delete}).`,
        );
      } else if (
        !row.rls_forced &&
        CRITICAL_FORCE_RLS_TABLES.has(row.table_name)
      ) {
        findings.push(
          `Tabela critica public.${row.table_name} sem FORCE ROW LEVEL SECURITY.`,
        );
      } else if (!row.rls_forced) {
        warnings.push(
          `Tabela public.${row.table_name} tem RLS mas sem FORCE ROW LEVEL SECURITY.`,
        );
      }
    }

    checks.runtimeRoleTableGrants = (
      await client.query(
        `
          SELECT
            grantee,
            table_name,
            privilege_type,
            (grantee <> current_user) AS inherited_or_public
          FROM information_schema.role_table_grants
          WHERE table_schema = 'public'
            AND (
              grantee = current_user
              OR grantee = 'PUBLIC'
              OR (grantee <> 'PUBLIC' AND pg_has_role(current_user, grantee, 'member'))
            )
          ORDER BY table_name, grantee, privilege_type
        `,
      )
    ).rows;

    const tablesWithCompanyId = new Set(
      checks.rlsCoverageCompanyId.map((row) => row.table_name),
    );
    const rlsCoverageByTable = new Map(
      checks.rlsCoverageCompanyId.map((row) => [row.table_name, row]),
    );

    const disallowedPrivilegeByTable = new Map();
    const incompleteRlsGrantByTable = new Map();

    for (const grant of checks.runtimeRoleTableGrants) {
      const privilege = String(grant.privilege_type || '').toUpperCase();
      const tableName = String(grant.table_name || '');

      if (DISALLOWED_RUNTIME_TABLE_PRIVILEGES.has(privilege)) {
        const current = disallowedPrivilegeByTable.get(tableName) || new Set();
        current.add(privilege);
        disallowedPrivilegeByTable.set(tableName, current);
      }

      if (!tablesWithCompanyId.has(tableName)) {
        continue;
      }

      const coverage = rlsCoverageByTable.get(tableName);
      if (!coverage?.rls_enabled || !coverage?.has_tenant_policy) {
        const current = incompleteRlsGrantByTable.get(tableName) || new Set();
        current.add(privilege);
        incompleteRlsGrantByTable.set(tableName, current);
      } else if (
        !coverage.rls_forced &&
        CRITICAL_FORCE_RLS_TABLES.has(tableName)
      ) {
        const current = incompleteRlsGrantByTable.get(tableName) || new Set();
        current.add(privilege);
        incompleteRlsGrantByTable.set(tableName, current);
      }
    }

    for (const [
      tableName,
      privileges,
    ] of disallowedPrivilegeByTable.entries()) {
      findings.push(
        `Role runtime possui grants indevidos em public.${tableName}: ${[
          ...privileges,
        ]
          .sort()
          .join(', ')}.`,
      );
    }

    for (const [tableName, privileges] of incompleteRlsGrantByTable.entries()) {
      findings.push(
        `Role runtime possui grants em public.${tableName} sem postura RLS completa: ${[
          ...privileges,
        ]
          .sort()
          .join(', ')}.`,
      );
    }

    // Extensions inventory (Neon/Supabase drift guard)
    checks.extensions = (
      await client.query(`
        SELECT extname, extversion
        FROM pg_extension
        ORDER BY extname
      `)
    ).rows;

    if (await tableExists(client, 'signatures')) {
      checks.signaturesSensitiveData = await fetchScalar(
        client,
        `
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (
              WHERE signature_data IS NOT NULL AND length(signature_data) > 0
            )::int AS inline_signature_data,
            COUNT(*) FILTER (
              WHERE signature_data_key IS NOT NULL AND signature_data_key <> ''
            )::int AS externalized_signature_data
          FROM signatures
        `,
      );

      if (
        Number(checks.signaturesSensitiveData.inline_signature_data || 0) > 0
      ) {
        warnings.push(
          'Assinaturas inline ainda existem; externalizar antes de bloquear DB-level.',
        );
      }
    }

    if (
      (await tableExists(client, 'companies')) &&
      (await tableExists(client, 'tenant_document_policies'))
    ) {
      checks.tenantDocumentPolicyCoverage = await fetchScalar(
        client,
        `
          SELECT
            (SELECT COUNT(*)::int FROM companies) AS companies_total,
            (SELECT COUNT(DISTINCT company_id)::int FROM tenant_document_policies)
              AS companies_with_policy,
            (
              SELECT COUNT(*)::int
              FROM companies c
              WHERE NOT EXISTS (
                SELECT 1
                FROM tenant_document_policies p
                WHERE p.company_id = c.id
              )
            ) AS companies_without_policy
        `,
      );

      if (
        Number(
          checks.tenantDocumentPolicyCoverage.companies_without_policy || 0,
        ) > 0
      ) {
        warnings.push(
          'Existem empresas sem tenant_document_policies explicita; confirmar fallback ou backfill controlado.',
        );
      }
    }

    await client.query('ROLLBACK');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // noop
    }
    throw error;
  } finally {
    await client.end();
  }

  return {
    version: 1,
    type: 'database_security_posture_check',
    generatedAt: new Date().toISOString(),
    target: databaseConfig.target,
    status: findings.length === 0 ? 'pass' : 'fail',
    findings,
    warnings,
    checks,
  };
}

function renderHumanReport(report) {
  const lines = [];
  lines.push(`# database_security_posture_check`);
  lines.push(`status: ${report.status}`);
  lines.push(`target: ${report.target}`);
  lines.push(`generated_at: ${report.generatedAt}`);
  lines.push('');
  lines.push('identity:');
  lines.push(
    `  database=${report.checks.identity?.database || 'unknown'} current_user=${report.checks.identity?.current_user || 'unknown'} session_user=${report.checks.identity?.session_user || 'unknown'}`,
  );
  lines.push('');
  lines.push('runtime_role:');
  lines.push(
    `  role=${report.checks.runtimeRole?.rolname || 'unknown'} super=${Boolean(report.checks.runtimeRole?.rolsuper)} bypassrls=${Boolean(report.checks.runtimeRole?.rolbypassrls)} createrole=${Boolean(report.checks.runtimeRole?.rolcreaterole)} createdb=${Boolean(report.checks.runtimeRole?.rolcreatedb)} replication=${Boolean(report.checks.runtimeRole?.rolreplication)}`,
  );
  lines.push('');
  lines.push('rls_company_id_tables:');
  for (const row of report.checks.rlsCoverageCompanyId || []) {
    lines.push(
      `  - public.${row.table_name}: rls_enabled=${Boolean(row.rls_enabled)} rls_forced=${Boolean(row.rls_forced)} tenant_policy=${Boolean(row.has_tenant_policy)}`,
    );
  }
  lines.push('');
  lines.push('extensions:');
  for (const extension of report.checks.extensions || []) {
    lines.push(`  - ${extension.extname}@${extension.extversion}`);
  }
  lines.push('');
  lines.push('runtime_role_table_grants:');
  for (const grant of report.checks.runtimeRoleTableGrants || []) {
    lines.push(
      `  - public.${grant.table_name}: ${grant.privilege_type} grantee=${grant.grantee}${grant.inherited_or_public ? ' inherited_or_public=true' : ''}`,
    );
  }
  lines.push('');
  lines.push(`findings (${report.findings.length}):`);
  if (report.findings.length === 0) {
    lines.push('  - none');
  } else {
    for (const finding of report.findings) {
      lines.push(`  - ${finding}`);
    }
  }
  lines.push('');
  lines.push(`warnings (${report.warnings.length}):`);
  if (report.warnings.length === 0) {
    lines.push('  - none');
  } else {
    for (const warning of report.warnings) {
      lines.push(`  - ${warning}`);
    }
  }
  return lines.join('\n');
}

async function main() {
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });

  const args = parseCliArgs(process.argv.slice(2));
  const report = await runCheck();
  const output = JSON.stringify(report, null, 2);

  if (args.json) {
    console.log(output);
  } else {
    console.log(renderHumanReport(report));
  }

  if (args.strict && report.status !== 'pass') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
