const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { connectRuntimePgClient } = require('./lib/pg-runtime-client');

const TENANT_COLUMNS = ['company_id', 'empresa_id', 'tenant_id'];
const IGNORED_TABLES = new Set(['migrations', 'typeorm_metadata']);

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

function toList(value) {
  if (typeof value !== 'string' || !value.trim()) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizePolicyFragment(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function parseArrayLike(input) {
  if (Array.isArray(input)) {
    return input
      .map((value) => String(value || '').trim())
      .filter(Boolean);
  }

  if (typeof input !== 'string') {
    return [];
  }

  const raw = input.trim();
  if (!raw) return [];

  if (raw.startsWith('{') && raw.endsWith('}')) {
    const body = raw.slice(1, -1);
    if (!body) return [];
    const values = [];
    let current = '';
    let inQuotes = false;
    for (let index = 0; index < body.length; index += 1) {
      const char = body[index];
      if (char === '"') {
        if (inQuotes && body[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (char === ',' && !inQuotes) {
        const value = current.trim();
        if (value) values.push(value);
        current = '';
        continue;
      }
      current += char;
    }
    const tail = current.trim();
    if (tail) values.push(tail);
    return values;
  }

  return [raw];
}

function hasTenantCondition(policyText, tenantColumns) {
  const normalized = normalizePolicyFragment(policyText);

  return tenantColumns.some((column) => {
    const directPatterns = [
      `${column} = current_company()`,
      `${column}=current_company()`,
      `${column} = current_company()::text`,
      `${column}=current_company()::text`,
    ];
    const castPatterns = [
      `${column}::text = current_company()::text`,
      `${column}::text=current_company()::text`,
      `${column}::text = (current_company())::text`,
      `${column}::text=(current_company())::text`,
      `(${column})::text = current_company()::text`,
      `(${column})::text=current_company()::text`,
      `(${column})::text = (current_company())::text`,
      `(${column})::text=(current_company())::text`,
    ];
    const allPatterns = [...directPatterns, ...castPatterns];
    return allPatterns.some((pattern) => normalized.includes(pattern));
  });
}

function hasSuperAdminCondition(policyText) {
  const normalized = normalizePolicyFragment(policyText);
  return (
    normalized.includes('is_super_admin() = true') ||
    normalized.includes('is_super_admin()=true')
  );
}

function createTimestampLabel(date) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function ensureParentDir(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

async function verifyTenantRls(options = {}) {
  const schema = options.schema || 'public';
  const requestedTables = Array.isArray(options.tables)
    ? options.tables
    : [];
  const includeOnlyRequested = requestedTables.length > 0;

  const report = {
    version: 1,
    type: 'tenant_rls_verification',
    startedAt: new Date().toISOString(),
    completedAt: null,
    schema,
    requestedTables,
    checkedTablesCount: 0,
    failuresCount: 0,
    status: 'failed',
    warnings: [],
    failures: [],
  };

  let runtimeConnection = null;
  let client = options.client || null;
  let ownsClient = false;

  try {
    if (!client) {
      runtimeConnection = await connectRuntimePgClient();
      client = runtimeConnection.client;
      ownsClient = true;
      report.warnings.push(...runtimeConnection.warnings);
      if (runtimeConnection.usedInsecureFallback) {
        report.warnings.push(
          'Conexão executada com fallback TLS (rejectUnauthorized=false).',
        );
      }
    }

    const tenantColumnsResult = await client.query(
      `
      SELECT
        c.table_name,
        array_agg(c.column_name ORDER BY c.ordinal_position) AS tenant_columns
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema
       AND t.table_name = c.table_name
      WHERE c.table_schema = $1
        AND t.table_type = 'BASE TABLE'
        AND c.column_name = ANY($2::text[])
      GROUP BY c.table_name
      ORDER BY c.table_name
      `,
      [schema, TENANT_COLUMNS],
    );

    const rows = includeOnlyRequested
      ? tenantColumnsResult.rows.filter((row) =>
          requestedTables.includes(row.table_name),
        )
      : tenantColumnsResult.rows;

    if (includeOnlyRequested) {
      const discovered = new Set(rows.map((row) => row.table_name));
      const missingRequested = requestedTables.filter(
        (tableName) => !discovered.has(tableName),
      );
      if (missingRequested.length > 0) {
        report.warnings.push(
          `Tabelas solicitadas sem coluna tenant no schema ${schema}: ${missingRequested.join(', ')}`,
        );
      }
    }

    for (const row of rows) {
      const tableName = row.table_name;
      if (IGNORED_TABLES.has(tableName)) continue;

      const tenantColumns = parseArrayLike(row.tenant_columns);

      const rlsResult = await client.query(
        `
        SELECT c.relrowsecurity, c.relforcerowsecurity
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1
          AND c.relname = $2
        `,
        [schema, tableName],
      );

      const policiesResult = await client.query(
        `
        SELECT policyname, cmd, permissive, qual, with_check
        FROM pg_policies
        WHERE schemaname = $1
          AND tablename = $2
        `,
        [schema, tableName],
      );

      const issues = [];
      const rls = rlsResult.rows[0];

      if (!rls?.relrowsecurity) {
        issues.push('RLS desabilitada');
      }
      if (!rls?.relforcerowsecurity) {
        issues.push('FORCE ROW LEVEL SECURITY ausente');
      }
      if (policiesResult.rows.length === 0) {
        issues.push('Nenhuma policy encontrada');
      } else {
        const matchingPolicy = policiesResult.rows.find((policy) => {
          const hasTenantUsing = hasTenantCondition(policy.qual, tenantColumns);
          const hasTenantWithCheck = hasTenantCondition(
            policy.with_check,
            tenantColumns,
          );
          const hasSuperAdminUsing = hasSuperAdminCondition(policy.qual);
          const hasSuperAdminWithCheck = hasSuperAdminCondition(
            policy.with_check,
          );
          return (
            hasTenantUsing &&
            hasTenantWithCheck &&
            hasSuperAdminUsing &&
            hasSuperAdminWithCheck
          );
        });

        if (!matchingPolicy) {
          issues.push(
            'Policy tenant-aware com USING + WITH CHECK + is_super_admin() não encontrada',
          );
        }
      }

      if (issues.length > 0) {
        report.failures.push({
          schema,
          tableName,
          tenantColumns,
          issues,
          policies: policiesResult.rows.map((policy) => ({
            policyname: policy.policyname,
            cmd: policy.cmd,
            permissive: policy.permissive,
          })),
        });
      }
    }

    report.checkedTablesCount = rows.length;
    report.failuresCount = report.failures.length;
    report.status = report.failures.length > 0 ? 'fail' : 'pass';
  } finally {
    report.completedAt = new Date().toISOString();
    if (ownsClient && client) {
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
  const tables = toList(args.tables);
  const outputJson = args.json === true;
  const outputDir = path.resolve(
    process.cwd(),
    typeof args['output-dir'] === 'string'
      ? args['output-dir']
      : path.join('output', 'security', 'rls'),
  );
  const reportFile =
    typeof args['report-file'] === 'string'
      ? path.resolve(process.cwd(), args['report-file'])
      : path.resolve(
          outputDir,
          `verify-tenant-rls-${schema}-${createTimestampLabel(new Date())}.json`,
        );

  let report;
  try {
    report = await verifyTenantRls({
      schema,
      tables,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[verify:rls] Falha inesperada: ${message}`);
    process.exit(1);
  }

  ensureParentDir(reportFile);
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf8');

  if (outputJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      `[verify:rls] schema=${schema} status=${report.status} checked=${report.checkedTablesCount} failures=${report.failuresCount}`,
    );
    if (report.warnings.length > 0) {
      for (const warning of report.warnings) {
        console.log(`[verify:rls] warning: ${warning}`);
      }
    }
    if (report.failures.length > 0) {
      console.error('[verify:rls] Inconsistências encontradas:');
      for (const failure of report.failures) {
        console.error(
          ` - ${failure.schema}.${failure.tableName} [${failure.tenantColumns.join(', ')}]: ${failure.issues.join('; ')}`,
        );
      }
    }
    console.log(`REPORT_FILE=${reportFile}`);
  }

  if (report.status !== 'pass') {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  verifyTenantRls,
};
