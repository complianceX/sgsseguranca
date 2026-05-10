const path = require('path');
const dotenv = require('dotenv');
const { connectRuntimePgClient } = require('./lib/pg-runtime-client');

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
      await client.query(`
        SELECT
          p.proname,
          COALESCE(p.proconfig::text, '') AS config
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = ANY($1::text[])
        ORDER BY p.proname
      `, [
        [
          'current_company',
          'is_super_admin',
          'current_app_user_id',
          'current_site_id',
          'current_site_scope',
        ],
      ])
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
        warnings.push(`Tabela ${tableName} ausente; indice ${indexName} ignorado.`);
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
      checks.expectedIndexes.push({ tableName, indexName, exists: exists.exists });
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

      if (Number(checks.signaturesSensitiveData.inline_signature_data || 0) > 0) {
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
        Number(checks.tenantDocumentPolicyCoverage.companies_without_policy || 0) >
        0
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

async function main() {
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });

  const args = parseCliArgs(process.argv.slice(2));
  const report = await runCheck();
  const output = JSON.stringify(report, null, 2);

  if (args.json) {
    console.log(output);
  } else {
    console.log(output);
  }

  if (args.strict && report.status !== 'pass') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
