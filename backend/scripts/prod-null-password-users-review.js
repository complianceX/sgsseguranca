const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { connectRuntimePgClient } = require('./lib/pg-runtime-client');

for (const envFile of ['.env', '../.env', '../.env.local']) {
  const resolved = path.resolve(__dirname, envFile);
  if (fs.existsSync(resolved)) {
    dotenv.config({ path: resolved, override: false });
  }
}

function parseArgs(argv) {
  const unsupportedMutationFlag = argv.find((arg) =>
    ['--apply', '--admin', '--write', '--delete', '--deactivate'].includes(arg),
  );
  if (unsupportedMutationFlag) {
    throw new Error(
      `${unsupportedMutationFlag} is intentionally unsupported. This review is read-only only.`,
    );
  }

  const sampleLimitArg = argv
    .find((arg) => arg.startsWith('--sample-limit='))
    ?.split('=')[1];
  const maxReferenceTablesArg = argv
    .find((arg) => arg.startsWith('--max-reference-tables='))
    ?.split('=')[1];

  const sampleLimit = Number(sampleLimitArg || '50');
  const maxReferenceTables = Number(maxReferenceTablesArg || '80');

  return {
    json: argv.includes('--json'),
    activeOnly: argv.includes('--active-only'),
    includeJsonTextRefs: argv.includes('--include-json-text-refs'),
    sampleLimit:
      Number.isFinite(sampleLimit) && sampleLimit > 0
        ? Math.min(Math.trunc(sampleLimit), 200)
        : 50,
    maxReferenceTables:
      Number.isFinite(maxReferenceTables) && maxReferenceTables > 0
        ? Math.min(Math.trunc(maxReferenceTables), 200)
        : 80,
  };
}

function shortHash(value, length = 12) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return crypto
    .createHash('sha256')
    .update(String(value))
    .digest('hex')
    .slice(0, length);
}

function quoteIdent(identifier) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid identifier: ${identifier}`);
  }

  return `"${identifier.replace(/"/g, '""')}"`;
}

function qname(schemaName, tableName) {
  return `${quoteIdent(schemaName)}.${quoteIdent(tableName)}`;
}

async function queryOne(client, sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows[0] || {};
}

async function queryRows(client, sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows;
}

async function runReadOnlyTransaction(client, fn) {
  await client.query('BEGIN READ ONLY');
  try {
    await client.query(`SET LOCAL lock_timeout = '2s'`);
    await client.query(`SET LOCAL statement_timeout = '45s'`);
    await client.query(`SET LOCAL idle_in_transaction_session_timeout = '60s'`);
    await client.query(`SET LOCAL app.is_super_admin = 'true'`);
    const value = await fn();
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

function isTransientConnectionPressure(error) {
  const message =
    error && typeof error.message === 'string'
      ? error.message.toLowerCase()
      : '';

  return (
    message.includes('failed to acquire permit') ||
    message.includes('too many database connection attempts') ||
    message.includes('remaining connection slots are reserved') ||
    message.includes('too many clients')
  );
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectRuntimePgClientWithRetry(options) {
  const maxAttempts = 4;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await connectRuntimePgClient(options);
    } catch (error) {
      lastError = error;
      if (!isTransientConnectionPressure(error) || attempt === maxAttempts) {
        throw error;
      }

      await sleep(attempt * 5000);
    }
  }

  throw lastError;
}

function candidateWhere(options) {
  return `
    (u.password IS NULL OR btrim(u.password) = '')
    ${options.activeOnly ? 'AND u.status = true AND u.deleted_at IS NULL' : ''}
  `;
}

function candidateCte(options) {
  const identityTypeSelect = options.userIdentityColumns?.identity_type
    ? 'u.identity_type'
    : 'NULL::text';
  const accessStatusSelect = options.userIdentityColumns?.access_status
    ? 'u.access_status'
    : 'NULL::text';

  return `
    WITH candidates AS (
      SELECT
        u.id,
        u.company_id,
        u.site_id,
        u.profile_id,
        u.status,
        u.deleted_at,
        u.email,
        u.cpf,
        u.auth_user_id,
        ${identityTypeSelect} AS identity_type,
        ${accessStatusSelect} AS access_status,
        u.ai_processing_consent,
        u.created_at,
        u.updated_at
      FROM public.users u
      WHERE ${candidateWhere(options)}
    )
  `;
}

async function discoverUserIdentityColumns(client) {
  const rows = await queryRows(
    client,
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name IN ('identity_type', 'access_status')
    `,
  );

  const columns = new Set(rows.map((row) => row.column_name));
  return {
    identity_type: columns.has('identity_type'),
    access_status: columns.has('access_status'),
  };
}

async function discoverDirectReferenceColumns(client, maxReferenceTables) {
  return queryRows(
    client,
    `
    SELECT
      n.nspname AS table_schema,
      c.relname AS table_name,
      a.attname AS column_name,
      pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
      con.conname AS fk_constraint,
      col_description(c.oid, a.attnum) AS column_comment
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_constraint con
      ON con.conrelid = c.oid
     AND con.contype = 'f'
     AND a.attnum = ANY(con.conkey)
     AND con.confrelid = 'public.users'::regclass
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relname <> 'users'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND pg_catalog.format_type(a.atttypid, a.atttypmod) IN (
        'uuid',
        'character varying',
        'character varying(32)',
        'character varying(64)',
        'character varying(120)',
        'character varying(128)',
        'text'
      )
      AND (
        con.oid IS NOT NULL
        OR a.attname ~* '(^|_)(user|usuario|actor|requester|requested_by|issued_for|uploaded_by|removed_by|approved_by|created_by|updated_by|responsavel|elaborador|assignee|owner)(_id)?$'
      )
    ORDER BY (con.oid IS NOT NULL) DESC, n.nspname, c.relname, a.attname
    LIMIT $1
    `,
    [maxReferenceTables],
  );
}

async function discoverJsonReferenceColumns(client, maxReferenceTables) {
  return queryRows(
    client,
    `
    SELECT
      n.nspname AS table_schema,
      c.relname AS table_name,
      a.attname AS column_name,
      pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relname <> 'users'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND pg_catalog.format_type(a.atttypid, a.atttypmod) IN ('json', 'jsonb')
      AND (
        a.attname ~* '(participant|participante|executante|worker|trabalh|signature|assin|responsavel|elaborador|user|usuario)'
        OR c.relname ~* '(apr|dds|did|pt|signature|assin|checklist|document)'
      )
    ORDER BY n.nspname, c.relname, a.attname
    LIMIT $1
    `,
    [maxReferenceTables],
  );
}

async function countDirectReferences(client, options, ref) {
  const qualifiedTable = qname(ref.table_schema, ref.table_name);
  const column = quoteIdent(ref.column_name);
  const sql = `
    ${candidateCte(options)}
    SELECT
      COUNT(*)::int AS total_refs,
      COUNT(DISTINCT c.id)::int AS referenced_users
    FROM candidates c
    JOIN ${qualifiedTable} target
      ON target.${column}::text = c.id::text
  `;

  const summary = await queryOne(client, sql);
  if (Number(summary.total_refs || 0) === 0) {
    return null;
  }

  const byUser = await queryRows(
    client,
    `
    ${candidateCte(options)}
    SELECT
      c.id::text AS user_id,
      COUNT(*)::int AS refs
    FROM candidates c
    JOIN ${qualifiedTable} target
      ON target.${column}::text = c.id::text
    GROUP BY c.id
    ORDER BY refs DESC, c.id ASC
    LIMIT $1
    `,
    [options.sampleLimit],
  );

  return {
    table: `${ref.table_schema}.${ref.table_name}`,
    column: ref.column_name,
    dataType: ref.data_type,
    fkConstraint: ref.fk_constraint || null,
    comment: ref.column_comment || null,
    totalRefs: summary.total_refs,
    referencedUsers: summary.referenced_users,
    topUsers: byUser.map((row) => ({
      userHash: shortHash(row.user_id),
      refs: row.refs,
    })),
  };
}

async function countJsonTextReferences(client, options, ref) {
  const qualifiedTable = qname(ref.table_schema, ref.table_name);
  const column = quoteIdent(ref.column_name);
  const sql = `
    ${candidateCte(options)}
    SELECT
      COUNT(*)::int AS total_refs,
      COUNT(DISTINCT c.id)::int AS referenced_users
    FROM candidates c
    JOIN ${qualifiedTable} target
      ON target.${column}::text LIKE ('%' || c.id::text || '%')
  `;

  const summary = await queryOne(client, sql);
  if (Number(summary.total_refs || 0) === 0) {
    return null;
  }

  const byUser = await queryRows(
    client,
    `
    ${candidateCte(options)}
    SELECT
      c.id::text AS user_id,
      COUNT(*)::int AS refs
    FROM candidates c
    JOIN ${qualifiedTable} target
      ON target.${column}::text LIKE ('%' || c.id::text || '%')
    GROUP BY c.id
    ORDER BY refs DESC, c.id ASC
    LIMIT $1
    `,
    [options.sampleLimit],
  );

  return {
    table: `${ref.table_schema}.${ref.table_name}`,
    column: ref.column_name,
    dataType: ref.data_type,
    matchMode: 'json_text_contains_user_uuid',
    totalRefs: summary.total_refs,
    referencedUsers: summary.referenced_users,
    topUsers: byUser.map((row) => ({
      userHash: shortHash(row.user_id),
      refs: row.refs,
    })),
  };
}

async function collectCandidateSummary(client, options) {
  return queryOne(
    client,
    `
    ${candidateCte(options)}
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = true AND deleted_at IS NULL)::int AS active_total,
      COUNT(*) FILTER (WHERE status = false AND deleted_at IS NULL)::int AS inactive_total,
      COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS deleted_total,
      COUNT(*) FILTER (WHERE email IS NOT NULL AND btrim(email) <> '')::int AS with_email,
      COUNT(*) FILTER (WHERE cpf IS NOT NULL AND btrim(cpf) <> '')::int AS with_cpf,
      COUNT(*) FILTER (WHERE auth_user_id IS NOT NULL)::int AS with_auth_user_id,
      COUNT(*) FILTER (
        WHERE status = true
          AND deleted_at IS NULL
          AND auth_user_id IS NOT NULL
      )::int AS active_auth_backed_without_local_password,
      COUNT(*) FILTER (
        WHERE status = true
          AND deleted_at IS NULL
          AND auth_user_id IS NULL
      )::int AS active_employee_signer_candidates,
      COUNT(*) FILTER (WHERE identity_type = 'system_user')::int AS classified_system_users,
      COUNT(*) FILTER (WHERE identity_type = 'employee_signer')::int AS classified_employee_signers,
      COUNT(*) FILTER (WHERE access_status = 'credentialed')::int AS classified_credentialed,
      COUNT(*) FILTER (WHERE access_status = 'no_login')::int AS classified_no_login,
      COUNT(*) FILTER (WHERE access_status = 'missing_credentials')::int AS classified_missing_credentials,
      COUNT(DISTINCT company_id)::int AS affected_tenants,
      COUNT(DISTINCT site_id) FILTER (WHERE site_id IS NOT NULL)::int AS affected_sites
    FROM candidates
    `,
  );
}

async function collectTenantProfileSummary(client, options) {
  return queryRows(
    client,
    `
    ${candidateCte(options)}
    SELECT
      c.company_id::text AS tenant_ref,
      COALESCE(p.nome, '(sem perfil)') AS profile_name,
      COUNT(*)::int AS qty,
      COUNT(*) FILTER (WHERE c.status = true AND c.deleted_at IS NULL)::int AS active_qty,
      COUNT(*) FILTER (WHERE c.status = true AND c.deleted_at IS NULL AND c.auth_user_id IS NOT NULL)::int AS active_auth_backed_without_local_password_qty,
      COUNT(*) FILTER (WHERE c.status = true AND c.deleted_at IS NULL AND c.auth_user_id IS NULL)::int AS active_employee_signer_candidate_qty,
      COUNT(*) FILTER (WHERE c.identity_type = 'system_user')::int AS classified_system_user_qty,
      COUNT(*) FILTER (WHERE c.identity_type = 'employee_signer')::int AS classified_employee_signer_qty,
      COUNT(*) FILTER (WHERE c.access_status = 'no_login')::int AS classified_no_login_qty,
      COUNT(*) FILTER (WHERE c.access_status = 'missing_credentials')::int AS classified_missing_credentials_qty,
      COUNT(*) FILTER (WHERE c.email IS NOT NULL AND btrim(c.email) <> '')::int AS with_email_qty,
      COUNT(*) FILTER (WHERE c.cpf IS NOT NULL AND btrim(c.cpf) <> '')::int AS with_cpf_qty,
      COUNT(*) FILTER (WHERE c.site_id IS NOT NULL)::int AS with_site_qty
    FROM candidates c
    LEFT JOIN public.profiles p ON p.id = c.profile_id
    GROUP BY c.company_id, p.nome
    ORDER BY qty DESC, active_qty DESC, profile_name ASC
    `,
  );
}

async function collectCandidateSamples(client, options) {
  const rows = await queryRows(
    client,
    `
    ${candidateCte(options)}
    SELECT
      c.id::text AS user_id,
      c.company_id::text AS tenant_ref,
      c.site_id::text AS site_ref,
      COALESCE(p.nome, '(sem perfil)') AS profile_name,
      c.status,
      (c.deleted_at IS NOT NULL) AS is_deleted,
      (c.email IS NOT NULL AND btrim(c.email) <> '') AS has_email,
      (c.cpf IS NOT NULL AND btrim(c.cpf) <> '') AS has_cpf,
      (c.auth_user_id IS NOT NULL) AS has_auth_user_id,
      c.identity_type,
      c.access_status,
      (c.site_id IS NOT NULL) AS has_site,
      c.ai_processing_consent,
      to_char(date_trunc('month', c.created_at), 'YYYY-MM') AS created_month,
      to_char(date_trunc('month', c.updated_at), 'YYYY-MM') AS updated_month
    FROM candidates c
    LEFT JOIN public.profiles p ON p.id = c.profile_id
    ORDER BY c.status DESC, c.created_at ASC NULLS LAST, c.id ASC
    LIMIT $1
    `,
    [options.sampleLimit],
  );

  return rows.map((row) => ({
    userHash: shortHash(row.user_id),
    tenantHash: shortHash(row.tenant_ref, 10),
    siteHash: shortHash(row.site_ref, 10),
    profileName: row.profile_name,
    identityClass: row.has_auth_user_id
      ? 'login_user_auth_backed_without_local_password'
      : 'employee_signer_without_login',
    dbIdentityType: row.identity_type || null,
    dbAccessStatus: row.access_status || null,
    active: row.status,
    isDeleted: row.is_deleted,
    hasEmail: row.has_email,
    hasCpf: row.has_cpf,
    hasAuthUserId: row.has_auth_user_id,
    hasSite: row.has_site,
    aiProcessingConsent: row.ai_processing_consent,
    createdMonth: row.created_month,
    updatedMonth: row.updated_month,
  }));
}

function buildRemediationMatrix(summary, referenceImpacts, options) {
  const totalDirectRefs = referenceImpacts.reduce(
    (sum, item) => sum + Number(item.totalRefs || 0),
    0,
  );
  const referencedUsers = new Set();
  for (const impact of referenceImpacts) {
    for (const user of impact.topUsers || []) {
      referencedUsers.add(user.userHash);
    }
  }

  return {
    safeToMutateNow: false,
    domainContract:
      'public.users stores people. A login user must have credentials/auth_user_id; an employee/signatory can remain active without login credentials to sign SST documents.',
    candidateCount: Number(summary.total || 0),
    activeCandidates: Number(summary.active_total || 0),
    activeEmployeeSignerCandidates: Number(
      summary.active_employee_signer_candidates || 0,
    ),
    activeAuthBackedWithoutLocalPassword: Number(
      summary.active_auth_backed_without_local_password || 0,
    ),
    affectedTenants: Number(summary.affected_tenants || 0),
    explicitIdentityModelDetected: Boolean(
      options.userIdentityColumns?.identity_type &&
        options.userIdentityColumns?.access_status,
    ),
    classifiedSystemUsers: Number(summary.classified_system_users || 0),
    classifiedEmployeeSigners: Number(
      summary.classified_employee_signers || 0,
    ),
    classifiedCredentialed: Number(summary.classified_credentialed || 0),
    classifiedNoLogin: Number(summary.classified_no_login || 0),
    classifiedMissingCredentials: Number(
      summary.classified_missing_credentials || 0,
    ),
    directReferenceRowsFound: totalDirectRefs,
    referencedUsersInTopSamples: referencedUsers.size,
    recommendedPath: [
      {
        phase: 'preserve_employee_signers',
        action:
          'Nao desativar automaticamente registros sem senha/auth_user_id; eles podem ser funcionarios cadastrados apenas para assinatura documental.',
        mutation: false,
      },
      {
        phase: 'login_user_review',
        action:
          'Revisar somente linhas com auth_user_id ou credencial esperada ausente; essas sim podem indicar usuario de login incompleto.',
        mutation: false,
      },
      {
        phase: 'future_persona_model',
        action:
          'Adicionar campo explicito de persona/acesso em fase propria, de forma aditiva e retrocompativel, antes de qualquer separacao fisica de tabelas.',
        mutation: false,
      },
    ],
  };
}

async function collectReview(client, options) {
  const userIdentityColumns = await discoverUserIdentityColumns(client);
  const scopedOptions = { ...options, userIdentityColumns };
  const summary = await collectCandidateSummary(client, scopedOptions);
  const tenantProfileSummary = await collectTenantProfileSummary(
    client,
    scopedOptions,
  );
  const candidateSamples = await collectCandidateSamples(client, scopedOptions);
  const directRefs = await discoverDirectReferenceColumns(
    client,
    scopedOptions.maxReferenceTables,
  );

  const referenceImpacts = [];
  for (const ref of directRefs) {
    const impact = await countDirectReferences(client, scopedOptions, ref);
    if (impact) {
      referenceImpacts.push(impact);
    }
  }

  const jsonTextReferenceImpacts = [];
  let jsonRefColumns = [];
  if (scopedOptions.includeJsonTextRefs) {
    jsonRefColumns = await discoverJsonReferenceColumns(
      client,
      scopedOptions.maxReferenceTables,
    );
    for (const ref of jsonRefColumns) {
      const impact = await countJsonTextReferences(client, scopedOptions, ref);
      if (impact) {
        jsonTextReferenceImpacts.push(impact);
      }
    }
  }

  return {
    summary,
    userIdentityColumns,
    tenantProfileSummary: tenantProfileSummary.map((row) => ({
      tenantHash: shortHash(row.tenant_ref, 10),
      profileName: row.profile_name,
      qty: row.qty,
      activeQty: row.active_qty,
      activeAuthBackedWithoutLocalPasswordQty:
        row.active_auth_backed_without_local_password_qty,
      activeEmployeeSignerCandidateQty:
        row.active_employee_signer_candidate_qty,
      classifiedSystemUserQty: row.classified_system_user_qty,
      classifiedEmployeeSignerQty: row.classified_employee_signer_qty,
      classifiedNoLoginQty: row.classified_no_login_qty,
      classifiedMissingCredentialsQty:
        row.classified_missing_credentials_qty,
      withEmailQty: row.with_email_qty,
      withCpfQty: row.with_cpf_qty,
      withSiteQty: row.with_site_qty,
    })),
    candidateSamples,
    discoveredReferenceColumns: directRefs.length,
    referenceImpacts,
    jsonTextReferenceScan: {
      enabled: options.includeJsonTextRefs,
      discoveredColumns: jsonRefColumns.length,
      impacts: jsonTextReferenceImpacts,
    },
    remediationMatrix: buildRemediationMatrix(summary, [
      ...referenceImpacts,
      ...jsonTextReferenceImpacts,
    ], scopedOptions),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { client, databaseConfig, warnings } =
    await connectRuntimePgClientWithRetry({
      useAdministrativeConfig: false,
    });

  const report = {
    version: 1,
    type: 'prod_null_password_users_review',
    mode: 'read_only',
    generatedAt: new Date().toISOString(),
    target: databaseConfig.target,
    warnings,
    guardrails: {
      supportsApply: false,
      transaction: 'BEGIN READ ONLY',
      runtimeRoleOnly: true,
      exposesRawPii: false,
      identityModel:
        'login user = password/auth_user_id; employee signer = person record without login credentials',
      activeOnly: options.activeOnly,
      includeJsonTextRefs: options.includeJsonTextRefs,
      sampleLimit: options.sampleLimit,
      maxReferenceTables: options.maxReferenceTables,
    },
    checks: {},
    status: 'failed',
  };

  try {
    await runReadOnlyTransaction(client, async () => {
      report.checks.identity = await queryOne(
        client,
        `
        SELECT
          current_database() AS db,
          current_user AS current_user,
          current_setting('transaction_read_only') AS transaction_read_only,
          current_setting('app.is_super_admin', true) AS app_is_super_admin,
          version() AS version
        `,
      );
      report.checks.review = await collectReview(client, options);
    });

    report.status = 'ok';
  } finally {
    await client.end();
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const review = report.checks.review;
  console.log(`Person identity/access review: ${report.status}`);
  console.log(`Target: ${report.target}`);
  console.log(
    `Guardrails: read-only=${report.checks.identity.transaction_read_only}, raw_pii=false, supports_apply=false`,
  );
  console.log(
    `Candidates: total=${review.summary.total}, active=${review.summary.active_total}, employee_signer_candidates=${review.summary.active_employee_signer_candidates}, auth_backed_without_local_password=${review.summary.active_auth_backed_without_local_password}`,
  );
  console.log(
    `Explicit model columns: identity_type=${review.userIdentityColumns.identity_type}, access_status=${review.userIdentityColumns.access_status}`,
  );
  console.log(
    `Reference impacts: direct=${review.referenceImpacts.length}, json_text=${review.jsonTextReferenceScan.impacts.length}`,
  );
  console.log('Run with --json for masked samples and remediation matrix.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
