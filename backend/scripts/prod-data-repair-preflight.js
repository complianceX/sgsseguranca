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
    ['--apply', '--admin', '--write'].includes(arg),
  );
  if (unsupportedMutationFlag) {
    throw new Error(
      `${unsupportedMutationFlag} is intentionally unsupported. This preflight is read-only only.`,
    );
  }

  const sampleLimitArg = argv
    .find((arg) => arg.startsWith('--sample-limit='))
    ?.split('=')[1];
  const sampleLimit = Number(sampleLimitArg || '20');

  return {
    json: argv.includes('--json'),
    sampleLimit:
      Number.isFinite(sampleLimit) && sampleLimit > 0
        ? Math.min(Math.trunc(sampleLimit), 100)
        : 20,
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

function buildAiRemediationAssessment(summary) {
  const invalidUuid = Number(summary.invalid_uuid || 0);
  const invalidUuidError = Number(summary.invalid_uuid_error || 0);
  const inconsistentInvalidWithUserUuid = Number(
    summary.inconsistent_invalid_with_user_uuid || 0,
  );
  const missingUser = Number(summary.missing_user || 0);
  const unclassified = Number(summary.unclassified || 0);

  const actions = [];
  if (unclassified > 0) {
    actions.push({
      priority: 'P1',
      action: 'canonicalize_unclassified_ai_interactions',
      safeToAutoApply: false,
      reason:
        'Rows still unclassified need a targeted backfill using the canonical trigger/function contract.',
    });
  }

  if (missingUser > 0) {
    actions.push({
      priority: 'P1',
      action: 'classify_missing_ai_users',
      safeToAutoApply: false,
      reason:
        'Rows point to UUID-shaped users that do not exist anymore; needs tenant/business or LGPD-retention decision.',
    });
  }

  if (inconsistentInvalidWithUserUuid > 0) {
    actions.push({
      priority: 'P1',
      action: 'fix_inconsistent_ai_user_uuid_status',
      safeToAutoApply: false,
      reason:
        'Invalid status with a non-null user_uuid is inconsistent and needs row-level review before update.',
    });
  }

  if (
    invalidUuid > 0 &&
    invalidUuid === invalidUuidError &&
    missingUser === 0 &&
    unclassified === 0 &&
    inconsistentInvalidWithUserUuid === 0
  ) {
    actions.push({
      priority: 'P3',
      action: 'no_immediate_update',
      safeToAutoApply: false,
      reason:
        'Invalid actor ids are already classified and all affected rows are error logs. Keeping them unchanged is safer than inventing a user mapping.',
    });
  }

  return {
    safeToMutateNow: false,
    actions,
    rollbackRequirement:
      'Before any future UPDATE, capture full ids and previous values in a secured operator-only artifact, then update in one bounded transaction with lock_timeout.',
  };
}

function buildUserPasswordAssessment(summary) {
  const active = Number(summary.active_total || 0);
  const authBackedWithoutLocalPassword = Number(
    summary.active_auth_backed_without_local_password || 0,
  );
  const employeeSignerCandidates = Number(
    summary.active_employee_signer_candidates || 0,
  );

  const actions = [];
  if (authBackedWithoutLocalPassword > 0) {
    actions.push({
      priority: 'P1',
      action: 'review_auth_backed_login_users_without_local_password',
      safeToAutoApply: false,
      affectedRows: authBackedWithoutLocalPassword,
      reason:
        'These rows look like login users because they have an auth_user_id, but they do not have a local password hash. Review the auth cutover contract before changing anything.',
    });
  }

  if (employeeSignerCandidates > 0) {
    actions.push({
      priority: 'P3',
      action: 'keep_employee_signer_records_unmutated',
      safeToAutoApply: false,
      affectedRows: employeeSignerCandidates,
      reason:
        'In this system, rows in users without password and without auth_user_id can be employees/signers, not broken login accounts. Do not deactivate them automatically.',
    });
  }

  if (active === 0) {
    actions.push({
      priority: 'P3',
      action: 'monitor_only',
      safeToAutoApply: false,
      reason:
        'No active user without password was found. Keep the audit in the release checklist.',
    });
  }

  return {
    safeToMutateNow: false,
    domainContract:
      'public.users is currently a person registry. Login users have credentials/auth_user_id; employees/signers can exist without login credentials to sign documents.',
    actions,
    rollbackRequirement:
      'Any future credential, deactivation, or persona migration must capture user id, status, auth_user_id, email/cpf presence, profile and document-signature references before mutation.',
  };
}

async function collectAiInteractionPreflight(client, sampleLimit) {
  const summary = await queryOne(
    client,
    `
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE user_ref_status = 'valid_user')::int AS valid_user,
      COUNT(*) FILTER (WHERE user_ref_status = 'invalid_uuid')::int AS invalid_uuid,
      COUNT(*) FILTER (
        WHERE user_ref_status = 'invalid_uuid'
          AND status = 'error'
      )::int AS invalid_uuid_error,
      COUNT(*) FILTER (
        WHERE user_ref_status = 'invalid_uuid'
          AND user_uuid IS NOT NULL
      )::int AS inconsistent_invalid_with_user_uuid,
      COUNT(*) FILTER (WHERE user_ref_status = 'missing_user')::int AS missing_user,
      COUNT(*) FILTER (
        WHERE user_ref_status IS NULL OR user_ref_status = 'unclassified'
      )::int AS unclassified
    FROM public.ai_interactions
    `,
  );

  const nonValidByMonth = await queryRows(
    client,
    `
    SELECT
      to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
      COALESCE(provider, 'unknown') AS provider,
      COALESCE(status, 'unknown') AS status,
      COALESCE(user_ref_status, 'null') AS user_ref_status,
      COUNT(*)::int AS qty,
      COUNT(DISTINCT COALESCE(tenant_uuid::text, tenant_id::text))::int AS tenants,
      COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS deleted_rows
    FROM public.ai_interactions
    WHERE user_ref_status IS DISTINCT FROM 'valid_user'
    GROUP BY 1, 2, 3, 4
    ORDER BY month, provider, status, user_ref_status
    `,
  );

  const nonValidSamples = await queryRows(
    client,
    `
    SELECT
      id::text AS interaction_id,
      created_at,
      COALESCE(tenant_uuid::text, tenant_id::text) AS tenant_ref,
      user_id::text AS user_ref,
      char_length(COALESCE(user_id::text, ''))::int AS user_ref_length,
      COALESCE(provider, 'unknown') AS provider,
      COALESCE(status, 'unknown') AS status,
      COALESCE(user_ref_status, 'null') AS user_ref_status,
      (user_uuid IS NOT NULL) AS has_user_uuid,
      (deleted_at IS NOT NULL) AS is_deleted
    FROM public.ai_interactions
    WHERE user_ref_status IS DISTINCT FROM 'valid_user'
    ORDER BY created_at ASC, id ASC
    LIMIT $1
    `,
    [sampleLimit],
  );

  return {
    summary,
    nonValidByMonth,
    nonValidSamples: nonValidSamples.map((row) => ({
      interactionHash: shortHash(`${row.interaction_id}:${row.created_at}`),
      createdAt: row.created_at,
      tenantHash: shortHash(row.tenant_ref, 10),
      userRefHash: shortHash(row.user_ref, 10),
      userRefLength: row.user_ref_length,
      provider: row.provider,
      status: row.status,
      userRefStatus: row.user_ref_status,
      hasUserUuid: row.has_user_uuid,
      isDeleted: row.is_deleted,
    })),
    assessment: buildAiRemediationAssessment(summary),
  };
}

async function collectNullPasswordUserPreflight(client, sampleLimit) {
  const summary = await queryOne(
    client,
    `
    WITH base AS (
      SELECT
        u.id,
        u.status,
        u.deleted_at,
        u.email,
        u.cpf,
        u.auth_user_id,
        u.company_id,
        u.profile_id,
        u.site_id
      FROM public.users u
      WHERE u.password IS NULL OR btrim(u.password) = ''
    )
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = true)::int AS active_total,
      COUNT(*) FILTER (WHERE status = false)::int AS inactive_total,
      COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS deleted_total,
      COUNT(*) FILTER (WHERE status = true AND email IS NOT NULL AND btrim(email) <> '')::int AS active_with_email,
      COUNT(*) FILTER (WHERE status = true AND cpf IS NOT NULL AND btrim(cpf) <> '')::int AS active_with_cpf,
      COUNT(*) FILTER (
        WHERE status = true
          AND email IS NOT NULL AND btrim(email) <> ''
          AND cpf IS NOT NULL AND btrim(cpf) <> ''
      )::int AS active_with_email_and_cpf,
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
      COUNT(*) FILTER (
        WHERE status = true
          AND (email IS NULL OR btrim(email) = '')
      )::int AS active_without_email,
      COUNT(*) FILTER (
        WHERE status = true
          AND (cpf IS NULL OR btrim(cpf) = '')
      )::int AS active_without_cpf,
      COUNT(*) FILTER (
        WHERE status = true
          AND (
            email IS NULL OR btrim(email) = ''
            OR cpf IS NULL OR btrim(cpf) = ''
          )
      )::int AS active_without_email_or_cpf,
      COUNT(DISTINCT company_id)::int AS affected_tenants
    FROM base
    `,
  );

  const byTenantProfile = await queryRows(
    client,
    `
    SELECT
      u.company_id::text AS tenant_ref,
      COALESCE(p.nome, '(sem perfil)') AS profile_name,
      COUNT(*)::int AS qty,
      COUNT(*) FILTER (WHERE u.status = true)::int AS active_qty,
      COUNT(*) FILTER (WHERE u.status = true AND u.auth_user_id IS NOT NULL)::int AS active_auth_backed_without_local_password_qty,
      COUNT(*) FILTER (WHERE u.status = true AND u.auth_user_id IS NULL)::int AS active_employee_signer_candidate_qty,
      COUNT(*) FILTER (WHERE u.email IS NULL OR btrim(u.email) = '')::int AS without_email_qty,
      COUNT(*) FILTER (WHERE u.cpf IS NULL OR btrim(u.cpf) = '')::int AS without_cpf_qty
    FROM public.users u
    LEFT JOIN public.profiles p ON p.id = u.profile_id
    WHERE u.password IS NULL OR btrim(u.password) = ''
    GROUP BY u.company_id, p.nome
    ORDER BY qty DESC, active_qty DESC, profile_name ASC
    `,
  );

  const samples = await queryRows(
    client,
    `
    SELECT
      u.id::text AS user_id,
      u.company_id::text AS tenant_ref,
      COALESCE(p.nome, '(sem perfil)') AS profile_name,
      u.status,
      (u.deleted_at IS NOT NULL) AS is_deleted,
      (u.email IS NOT NULL AND btrim(u.email) <> '') AS has_email,
      (u.cpf IS NOT NULL AND btrim(u.cpf) <> '') AS has_cpf,
      (u.auth_user_id IS NOT NULL) AS has_auth_user_id,
      (u.site_id IS NOT NULL) AS has_site,
      u.ai_processing_consent,
      to_char(date_trunc('month', u.created_at), 'YYYY-MM') AS created_month,
      to_char(date_trunc('month', u.updated_at), 'YYYY-MM') AS updated_month
    FROM public.users u
    LEFT JOIN public.profiles p ON p.id = u.profile_id
    WHERE u.password IS NULL OR btrim(u.password) = ''
    ORDER BY u.status DESC, u.created_at ASC NULLS LAST, u.id ASC
    LIMIT $1
    `,
    [sampleLimit],
  );

  return {
    summary,
    byTenantProfile: byTenantProfile.map((row) => ({
      tenantHash: shortHash(row.tenant_ref, 10),
      profileName: row.profile_name,
      qty: row.qty,
      activeQty: row.active_qty,
      activeAuthBackedWithoutLocalPasswordQty:
        row.active_auth_backed_without_local_password_qty,
      activeEmployeeSignerCandidateQty:
        row.active_employee_signer_candidate_qty,
      withoutEmailQty: row.without_email_qty,
      withoutCpfQty: row.without_cpf_qty,
    })),
    samples: samples.map((row) => ({
      userHash: shortHash(row.user_id),
      tenantHash: shortHash(row.tenant_ref, 10),
      profileName: row.profile_name,
      identityClass: row.has_auth_user_id
        ? 'login_user_auth_backed_without_local_password'
        : 'employee_signer_without_login',
      active: row.status,
      isDeleted: row.is_deleted,
      hasEmail: row.has_email,
      hasCpf: row.has_cpf,
      hasAuthUserId: row.has_auth_user_id,
      hasSite: row.has_site,
      aiProcessingConsent: row.ai_processing_consent,
      createdMonth: row.created_month,
      updatedMonth: row.updated_month,
    })),
    assessment: buildUserPasswordAssessment(summary),
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
    type: 'prod_data_repair_preflight',
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
      sampleLimit: options.sampleLimit,
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

      report.checks.aiInteractions =
        await collectAiInteractionPreflight(client, options.sampleLimit);
      report.checks.nullPasswordUsers =
        await collectNullPasswordUserPreflight(client, options.sampleLimit);
    });

    report.status = 'ok';
  } finally {
    await client.end();
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const aiSummary = report.checks.aiInteractions.summary;
  const userSummary = report.checks.nullPasswordUsers.summary;

  console.log(`Production data repair preflight: ${report.status}`);
  console.log(`Target: ${report.target}`);
  console.log(
    `Guardrails: read-only=${report.checks.identity.transaction_read_only}, raw_pii=false, supports_apply=false`,
  );
  console.log(
    `AI interactions: invalid_uuid=${aiSummary.invalid_uuid}, missing_user=${aiSummary.missing_user}, unclassified=${aiSummary.unclassified}`,
  );
  console.log(
    `Person records without login password: total=${userSummary.total}, active=${userSummary.active_total}, employee_signer_candidates=${userSummary.active_employee_signer_candidates}, auth_backed_without_local_password=${userSummary.active_auth_backed_without_local_password}`,
  );
  console.log('Run with --json for masked samples and remediation assessment.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
