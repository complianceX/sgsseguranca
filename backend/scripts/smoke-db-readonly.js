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

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function parseIntOrDefault(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

async function timedQuery(client, sql, params = [], iterations = 1) {
  const times = [];
  let rows = 0;
  for (let index = 0; index < iterations; index += 1) {
    const start = process.hrtime.bigint();
    const result = await client.query(sql, params);
    const end = process.hrtime.bigint();
    times.push(Number(end - start) / 1e6);
    rows = result.rowCount ?? 0;
  }

  return {
    iterations,
    rows,
    min_ms: Math.min(...times),
    avg_ms: times.reduce((acc, value) => acc + value, 0) / times.length,
    p50_ms: percentile(times, 50),
    p95_ms: percentile(times, 95),
    max_ms: Math.max(...times),
  };
}

async function runSmoke(options = {}) {
  const schema = options.schema || 'public';
  const iterations = options.iterations || 10;
  const latencyWarnMs = options.latencyWarnMs || 300;
  const criticalTables = options.criticalTables || [
    'users',
    'companies',
    'aprs',
    'dds',
    'profiles',
    'roles',
    'user_roles',
    'role_permissions',
  ];

  const report = {
    version: 1,
    type: 'db_readonly_smoke',
    startedAt: new Date().toISOString(),
    completedAt: null,
    status: 'fail',
    schema,
    checks: {},
    warnings: [],
    errors: [],
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

    const identity = await client.query(`
      SELECT
        current_database() AS db,
        current_user AS current_user,
        version() AS version,
        now() AS now,
        pg_size_pretty(pg_database_size(current_database())) AS db_size
    `);
    report.checks.identity = identity.rows[0];
    report.checks.runtime_rls_context = {
      is_super_admin: true,
      reason:
        'Smoke read-only usa a role de runtime e habilita contexto super-admin por sessão para medir consistência global sem usar role BYPASSRLS.',
    };

    await client.query(
      `SELECT set_config('app.is_super_admin', 'true', false)`,
    );

    const tablesResult = await client.query(
      `
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = $1
        AND tablename = ANY($2::text[])
      ORDER BY tablename
      `,
      [schema, criticalTables],
    );
    const existingTables = new Set(
      tablesResult.rows.map((row) => row.tablename),
    );
    report.checks.tables = {
      expected: criticalTables,
      found: [...existingTables],
      missing: criticalTables.filter(
        (tableName) => !existingTables.has(tableName),
      ),
    };

    if (report.checks.tables.missing.length > 0) {
      report.errors.push(
        `Tabelas críticas ausentes no schema ${schema}: ${report.checks.tables.missing.join(', ')}`,
      );
    }

    const counts = {};
    for (const tableName of criticalTables) {
      if (!existingTables.has(tableName)) {
        counts[tableName] = null;
        continue;
      }
      const countResult = await client.query(
        `SELECT COUNT(*)::bigint AS total FROM "${schema}"."${tableName}"`,
      );
      counts[tableName] = Number(countResult.rows[0].total);
    }
    report.checks.counts = counts;

    if (existingTables.has('users')) {
      const duplicateCpf = await client.query(
        `
        SELECT cpf, COUNT(*)::int AS qty
        FROM "${schema}"."users"
        WHERE cpf IS NOT NULL AND btrim(cpf) <> ''
        GROUP BY cpf
        HAVING COUNT(*) > 1
        ORDER BY qty DESC, cpf
        LIMIT 10
        `,
      );
      const duplicateEmail = await client.query(
        `
        SELECT lower(email) AS email, COUNT(*)::int AS qty
        FROM "${schema}"."users"
        WHERE email IS NOT NULL AND btrim(email) <> ''
        GROUP BY lower(email)
        HAVING COUNT(*) > 1
        ORDER BY qty DESC, email
        LIMIT 10
        `,
      );
      const nullPassword = await client.query(
        `
        SELECT COUNT(*)::int AS total
        FROM "${schema}"."users"
        WHERE password IS NULL OR btrim(password) = ''
        `,
      );
      report.checks.users_quality = {
        duplicate_cpf_top10: duplicateCpf.rows,
        duplicate_email_top10: duplicateEmail.rows,
        null_or_empty_password: Number(nullPassword.rows[0].total),
      };
    }

    if (existingTables.has('companies')) {
      const duplicateCnpj = await client.query(
        `
        SELECT cnpj, COUNT(*)::int AS qty
        FROM "${schema}"."companies"
        WHERE cnpj IS NOT NULL AND btrim(cnpj) <> ''
        GROUP BY cnpj
        HAVING COUNT(*) > 1
        ORDER BY qty DESC, cnpj
        LIMIT 10
        `,
      );
      report.checks.companies_quality = {
        duplicate_cnpj_top10: duplicateCnpj.rows,
      };
    }

    const latency = {};
    latency.select_1 = await timedQuery(client, 'SELECT 1', [], iterations);
    if (existingTables.has('users')) {
      latency.count_users = await timedQuery(
        client,
        `SELECT COUNT(*) FROM "${schema}"."users"`,
        [],
        iterations,
      );
    }
    if (existingTables.has('companies')) {
      latency.count_companies = await timedQuery(
        client,
        `SELECT COUNT(*) FROM "${schema}"."companies"`,
        [],
        iterations,
      );
    }
    if (existingTables.has('users') && existingTables.has('companies')) {
      latency.join_users_companies = await timedQuery(
        client,
        `
        SELECT u.id, u.company_id, c.id AS company_pk
        FROM "${schema}"."users" u
        LEFT JOIN "${schema}"."companies" c ON c.id = u.company_id
        ORDER BY u.created_at DESC NULLS LAST
        LIMIT 100
        `,
        [],
        Math.max(3, Math.ceil(iterations / 2)),
      );
    }
    report.checks.latency = latency;

    if (
      latency.select_1 &&
      typeof latency.select_1.p95_ms === 'number' &&
      latency.select_1.p95_ms > latencyWarnMs
    ) {
      report.warnings.push(
        `Latência p95 de SELECT 1 acima do alvo (${latencyWarnMs}ms): ${latency.select_1.p95_ms.toFixed(2)}ms`,
      );
    }

    const scanStats = await client.query(
      `
      SELECT relname, seq_scan, idx_scan, n_live_tup
      FROM pg_stat_user_tables
      WHERE schemaname = $1
      ORDER BY seq_scan DESC
      LIMIT 20
      `,
      [schema],
    );
    report.checks.scan_stats_top20 = scanStats.rows;

    const connectionStates = await client.query(
      `
      SELECT state, COUNT(*)::int AS qty
      FROM pg_stat_activity
      WHERE datname = current_database()
      GROUP BY state
      ORDER BY qty DESC
      `,
    );
    report.checks.connection_states = connectionStates.rows;

    const pgStatStatements = await client.query(
      `SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_stat_statements') AS enabled`,
    );
    if (pgStatStatements.rows[0].enabled) {
      try {
        const topSlow = await client.query(
          `
          SELECT
            calls,
            ROUND(mean_exec_time::numeric, 3) AS mean_exec_ms,
            ROUND(total_exec_time::numeric, 3) AS total_exec_ms,
            LEFT(query, 140) AS query_sample
          FROM pg_stat_statements
          ORDER BY mean_exec_time DESC
          LIMIT 10
          `,
        );
        report.checks.pg_stat_statements_top10 = topSlow.rows;
      } catch (error) {
        report.warnings.push(
          `pg_stat_statements habilitado, mas sem permissão completa: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } else {
      report.warnings.push('Extensão pg_stat_statements não habilitada.');
    }

    report.status = report.errors.length > 0 ? 'fail' : 'pass';
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
  const schema = typeof args.schema === 'string' ? args.schema : 'public';
  const iterations = parseIntOrDefault(args.iterations, 10);
  const latencyWarnMs = parseIntOrDefault(args['latency-warn-ms'], 300);
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
          `db-smoke-readonly-${schema}-${createTimestampLabel(new Date())}.json`,
        );

  const report = await runSmoke({
    schema,
    iterations,
    latencyWarnMs,
  });

  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf8');

  if (outputJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const counts = report.checks.counts || {};
    const latency = report.checks.latency || {};
    console.log(`STATUS=${report.status}`);
    console.log(`REPORT_FILE=${reportFile}`);
    if (report.checks.identity) {
      console.log(`DB=${report.checks.identity.db}`);
      console.log(`DB_SIZE=${report.checks.identity.db_size}`);
    }
    if (report.checks.tables) {
      console.log(`TABLES_MISSING=${report.checks.tables.missing.length}`);
    }
    console.log(`USERS=${counts.users ?? 'n/a'}`);
    console.log(`COMPANIES=${counts.companies ?? 'n/a'}`);
    console.log(`APRS=${counts.aprs ?? 'n/a'}`);
    console.log(`DDS=${counts.dds ?? 'n/a'}`);
    if (latency.select_1?.p95_ms != null) {
      console.log(`SELECT1_P95_MS=${latency.select_1.p95_ms.toFixed(2)}`);
    }
    if (latency.count_users?.p95_ms != null) {
      console.log(
        `COUNT_USERS_P95_MS=${latency.count_users.p95_ms.toFixed(2)}`,
      );
    }
    if (latency.count_companies?.p95_ms != null) {
      console.log(
        `COUNT_COMPANIES_P95_MS=${latency.count_companies.p95_ms.toFixed(2)}`,
      );
    }
    console.log(`WARNINGS=${report.warnings.length}`);
    for (const warning of report.warnings) {
      console.log(`WARN=${warning}`);
    }
    for (const error of report.errors) {
      console.log(`ERROR=${error}`);
    }
  }

  if (report.status !== 'pass') {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  runSmoke,
};
