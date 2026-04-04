const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { connectRuntimePgClient } = require('./lib/pg-runtime-client');

function parseCliArgs(argv) {
  const options = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const arg = token.slice(2);
    if (!arg) continue;
    const equalIndex = arg.indexOf('=');
    if (equalIndex === -1) {
      options[arg] = true;
      continue;
    }
    const key = arg.slice(0, equalIndex);
    const value = arg.slice(equalIndex + 1);
    options[key] = value;
  }
  return options;
}

function createTimestampLabel(date) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function pct(numerator, denominator) {
  if (!denominator) return 0;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

function classifyStatus(summary) {
  if (summary.active_missing_bridge > 0) {
    return 'fail';
  }

  if (summary.active_bridge_without_auth_row > 0) {
    return 'fail';
  }

  if (summary.active_missing_email > 0) {
    return 'warn';
  }

  if (summary.active_without_supabase_password > 0) {
    return 'warn';
  }

  return 'pass';
}

async function runAudit() {
  const report = {
    version: 1,
    type: 'supabase_auth_cutover_readiness',
    startedAt: new Date().toISOString(),
    completedAt: null,
    status: 'fail',
    warnings: [],
    errors: [],
    summary: null,
    samples: null,
  };

  let runtimeConnection = null;
  let client = null;

  try {
    runtimeConnection = await connectRuntimePgClient();
    client = runtimeConnection.client;

    report.warnings.push(...runtimeConnection.warnings);
    if (runtimeConnection.usedInsecureFallback) {
      report.warnings.push(
        'Conexão executada com fallback TLS (rejectUnauthorized=false).',
      );
    }

    const summaryResult = await client.query(`
      WITH active_users AS (
        SELECT
          u.id,
          u.email,
          u.password,
          u.auth_user_id,
          au.id AS auth_row_id,
          au.encrypted_password
        FROM public.users AS u
        LEFT JOIN auth.users AS au
          ON au.id = u.auth_user_id
        WHERE u.deleted_at IS NULL
          AND u.status = true
      )
      SELECT
        COUNT(*)::int AS active_users,
        COUNT(*) FILTER (WHERE auth_user_id IS NOT NULL)::int AS active_bridged,
        COUNT(*) FILTER (WHERE auth_user_id IS NULL)::int AS active_missing_bridge,
        COUNT(*) FILTER (
          WHERE auth_user_id IS NOT NULL
            AND auth_row_id IS NULL
        )::int AS active_bridge_without_auth_row,
        COUNT(*) FILTER (
          WHERE auth_row_id IS NOT NULL
            AND encrypted_password IS NOT NULL
            AND btrim(encrypted_password) <> ''
        )::int AS active_with_supabase_password,
        COUNT(*) FILTER (
          WHERE auth_row_id IS NULL
             OR encrypted_password IS NULL
             OR btrim(encrypted_password) = ''
        )::int AS active_without_supabase_password,
        COUNT(*) FILTER (
          WHERE email IS NULL OR btrim(email) = ''
        )::int AS active_missing_email,
        COUNT(*) FILTER (
          WHERE password IS NULL OR btrim(password) = ''
        )::int AS active_without_local_password,
        COUNT(*) FILTER (
          WHERE password IS NOT NULL
            AND btrim(password) <> ''
        )::int AS active_with_local_password,
        COUNT(*) FILTER (
          WHERE password LIKE '$argon2%'
        )::int AS active_local_argon2,
        COUNT(*) FILTER (
          WHERE password LIKE '$2%'
        )::int AS active_local_bcrypt,
        COUNT(*) FILTER (
          WHERE password IS NOT NULL
            AND btrim(password) <> ''
            AND password NOT LIKE '$argon2%'
            AND password NOT LIKE '$2%'
        )::int AS active_local_plaintext_or_unknown
      FROM active_users
    `);

    const row = summaryResult.rows[0];
    const summary = {
      active_users: Number(row.active_users || 0),
      active_bridged: Number(row.active_bridged || 0),
      active_missing_bridge: Number(row.active_missing_bridge || 0),
      active_bridge_without_auth_row: Number(
        row.active_bridge_without_auth_row || 0,
      ),
      active_with_supabase_password: Number(
        row.active_with_supabase_password || 0,
      ),
      active_without_supabase_password: Number(
        row.active_without_supabase_password || 0,
      ),
      active_missing_email: Number(row.active_missing_email || 0),
      active_without_local_password: Number(
        row.active_without_local_password || 0,
      ),
      active_with_local_password: Number(row.active_with_local_password || 0),
      active_local_argon2: Number(row.active_local_argon2 || 0),
      active_local_bcrypt: Number(row.active_local_bcrypt || 0),
      active_local_plaintext_or_unknown: Number(
        row.active_local_plaintext_or_unknown || 0,
      ),
    };

    summary.supabase_password_coverage_pct = pct(
      summary.active_with_supabase_password,
      summary.active_users,
    );
    summary.bridge_coverage_pct = pct(
      summary.active_bridged,
      summary.active_users,
    );

    const samplesResult = await client.query(`
      WITH active_users AS (
        SELECT
          u.id,
          u.nome,
          u.email,
          u.cpf,
          u.auth_user_id,
          au.id AS auth_row_id,
          au.encrypted_password
        FROM public.users AS u
        LEFT JOIN auth.users AS au
          ON au.id = u.auth_user_id
        WHERE u.deleted_at IS NULL
          AND u.status = true
      )
      SELECT
        COALESCE(
          json_agg(missing_bridge_rows ORDER BY missing_bridge_rows.nome)
            FILTER (WHERE missing_bridge_rows.id IS NOT NULL),
          '[]'::json
        ) AS missing_bridge,
        COALESCE(
          json_agg(missing_password_rows ORDER BY missing_password_rows.nome)
            FILTER (WHERE missing_password_rows.id IS NOT NULL),
          '[]'::json
        ) AS without_supabase_password
      FROM (
        SELECT id, nome, email, cpf
        FROM active_users
        WHERE auth_user_id IS NULL
        ORDER BY nome
        LIMIT 20
      ) AS missing_bridge_rows
      FULL JOIN (
        SELECT id, nome, email, cpf
        FROM active_users
        WHERE auth_row_id IS NULL
           OR encrypted_password IS NULL
           OR btrim(encrypted_password) = ''
        ORDER BY nome
        LIMIT 20
      ) AS missing_password_rows
      ON FALSE
    `);

    report.summary = summary;
    report.samples = samplesResult.rows[0];
    report.status = classifyStatus(summary);

    if (summary.active_without_supabase_password > 0) {
      report.warnings.push(
        'Existem usuários ativos ainda sem senha utilizável no Supabase Auth. Eles exigem login local bem-sucedido ou reset de senha antes do cutover final.',
      );
    }

    if (summary.active_local_plaintext_or_unknown > 0) {
      report.warnings.push(
        'Ainda existem senhas locais fora do padrão argon2/bcrypt. Esse legado deve ser eliminado antes de remover definitivamente public.users.password.',
      );
    }

    if (summary.active_missing_email > 0) {
      report.warnings.push(
        'Existem usuários ativos sem e-mail. Eles não conseguem completar fluxos padrão de reset via Supabase Auth sem saneamento prévio.',
      );
    }
  } catch (error) {
    report.errors.push(error instanceof Error ? error.message : String(error));
    report.status = 'fail';
  } finally {
    report.completedAt = new Date().toISOString();
    if (client) {
      try {
        await client.end();
      } catch {
        // noop
      }
    }
  }

  return report;
}

async function main() {
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });

  const args = parseCliArgs(process.argv.slice(2));
  const outputJson = args.json === true;
  const outputDir = path.resolve(
    process.cwd(),
    typeof args['output-dir'] === 'string'
      ? args['output-dir']
      : path.join('temp'),
  );
  const reportFile =
    typeof args['report-file'] === 'string'
      ? path.resolve(process.cwd(), args['report-file'])
      : path.resolve(
          outputDir,
          `supabase-auth-cutover-${createTimestampLabel(new Date())}.json`,
        );

  const report = await runAudit();

  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf8');

  if (outputJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const summary = report.summary || {};
    console.log(`STATUS=${report.status}`);
    console.log(`REPORT_FILE=${reportFile}`);
    console.log(`ACTIVE_USERS=${summary.active_users ?? 'n/a'}`);
    console.log(`BRIDGED=${summary.active_bridged ?? 'n/a'}`);
    console.log(`MISSING_BRIDGE=${summary.active_missing_bridge ?? 'n/a'}`);
    console.log(
      `SUPABASE_PASSWORD_READY=${summary.active_with_supabase_password ?? 'n/a'}`,
    );
    console.log(
      `WITHOUT_SUPABASE_PASSWORD=${summary.active_without_supabase_password ?? 'n/a'}`,
    );
    console.log(`MISSING_EMAIL=${summary.active_missing_email ?? 'n/a'}`);
    console.log(
      `LOCAL_PLAINTEXT_OR_UNKNOWN=${summary.active_local_plaintext_or_unknown ?? 'n/a'}`,
    );
    console.log(
      `BRIDGE_COVERAGE_PCT=${summary.bridge_coverage_pct ?? 'n/a'}`,
    );
    console.log(
      `SUPABASE_PASSWORD_COVERAGE_PCT=${summary.supabase_password_coverage_pct ?? 'n/a'}`,
    );
    for (const warning of report.warnings || []) {
      console.log(`WARN=${warning}`);
    }
    for (const error of report.errors || []) {
      console.log(`ERROR=${error}`);
    }
  }

  if (report.status === 'fail') {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  runAudit,
};
