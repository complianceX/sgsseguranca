const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { connectRuntimePgClient } = require('./lib/pg-runtime-client');
const { verifyTenantRls } = require('./verify-tenant-rls');

const TARGET_TABLES = [
  'document_video_attachments',
  'forensic_trail_events',
  'pdf_integrity_records',
  'monthly_snapshots',
];

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
    options[arg.slice(0, equalIndex)] = arg.slice(equalIndex + 1);
  }
  return options;
}

function createSchemaName(prefix) {
  const safePrefix = String(prefix || 'tmp_homolog_rls').replace(
    /[^a-zA-Z0-9_]/g,
    '_',
  );
  const label = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, '')
    .slice(0, 14);
  return `${safePrefix}_${label}`.toLowerCase();
}

function createTimestampLabel(date) {
  return date.toISOString().replace(/[:.]/g, '-');
}

async function tableExists(client, schema, tableName) {
  const result = await client.query(
    `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = $1
        AND table_name = $2
        AND table_type = 'BASE TABLE'
    ) AS exists
    `,
    [schema, tableName],
  );
  return Boolean(result.rows[0]?.exists);
}

async function ensureTenantPolicy(client, schemaName, tableName) {
  await client.query(
    `ALTER TABLE "${schemaName}"."${tableName}" ENABLE ROW LEVEL SECURITY`,
  );
  await client.query(
    `ALTER TABLE "${schemaName}"."${tableName}" FORCE ROW LEVEL SECURITY`,
  );

  const policyResult = await client.query(
    `
    SELECT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = $1
        AND tablename = $2
        AND policyname = 'tenant_isolation_policy'
    ) AS exists
    `,
    [schemaName, tableName],
  );

  if (!policyResult.rows[0]?.exists) {
    await client.query(`
      CREATE POLICY "tenant_isolation_policy"
      ON "${schemaName}"."${tableName}"
      USING (
        (company_id)::text = (current_company())::text
        OR is_super_admin() = true
      )
      WITH CHECK (
        (company_id)::text = (current_company())::text
        OR is_super_admin() = true
      )
    `);
  }
}

async function runHomologRls(options = {}) {
  const schemaPrefix = options.schemaPrefix || 'tmp_homolog_rls';
  const keepSchema = options.keepSchema === true;
  const report = {
    version: 1,
    type: 'homolog_rls_temp_schema',
    startedAt: new Date().toISOString(),
    completedAt: null,
    status: 'fail',
    schemaName: createSchemaName(schemaPrefix),
    warnings: [],
    errors: [],
    details: {
      sourceSchema: 'public',
      targetTables: TARGET_TABLES,
      clonedTables: [],
      missingSourceTables: [],
      verifyResult: null,
    },
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

    await client.query(`CREATE SCHEMA "${report.schemaName}"`);

    for (const tableName of TARGET_TABLES) {
      const existsInPublic = await tableExists(client, 'public', tableName);
      if (!existsInPublic) {
        report.details.missingSourceTables.push(tableName);
        continue;
      }

      await client.query(`
        CREATE TABLE "${report.schemaName}"."${tableName}"
        (LIKE "public"."${tableName}" INCLUDING ALL)
      `);
      report.details.clonedTables.push(tableName);
      await ensureTenantPolicy(client, report.schemaName, tableName);
    }

    if (report.details.clonedTables.length === 0) {
      report.errors.push(
        'Nenhuma tabela alvo foi clonada para homologação (verifique schema fonte).',
      );
      report.status = 'fail';
      return report;
    }

    const verifyResult = await verifyTenantRls({
      schema: report.schemaName,
      tables: report.details.clonedTables,
      client,
    });

    report.details.verifyResult = {
      status: verifyResult.status,
      checkedTablesCount: verifyResult.checkedTablesCount,
      failuresCount: verifyResult.failuresCount,
      warnings: verifyResult.warnings,
      failures: verifyResult.failures,
    };

    report.warnings.push(...verifyResult.warnings);
    if (verifyResult.status !== 'pass') {
      report.errors.push(
        `Validação RLS falhou no schema temporário (${verifyResult.failuresCount} falhas).`,
      );
      report.status = 'fail';
      return report;
    }

    report.status = 'pass';
    return report;
  } catch (error) {
    report.errors.push(error instanceof Error ? error.message : String(error));
    report.status = 'fail';
    return report;
  } finally {
    if (client && report.schemaName && !keepSchema) {
      try {
        await client.query(`DROP SCHEMA IF EXISTS "${report.schemaName}" CASCADE`);
      } catch (dropError) {
        report.warnings.push(
          `Falha ao remover schema temporário ${report.schemaName}: ${dropError instanceof Error ? dropError.message : String(dropError)}`,
        );
      }
    }
    if (client) {
      try {
        await client.end();
      } catch {
        // noop
      }
    }
    report.completedAt = new Date().toISOString();
  }
}

async function main() {
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });

  const args = parseCliArgs(process.argv.slice(2));
  const schemaPrefix =
    typeof args['schema-prefix'] === 'string'
      ? args['schema-prefix']
      : 'tmp_homolog_rls';
  const keepSchema = args['keep-schema'] === true;
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
          `homolog-rls-temp-schema-${createTimestampLabel(new Date())}.json`,
        );

  const report = await runHomologRls({
    schemaPrefix,
    keepSchema,
  });

  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf8');

  if (outputJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`STATUS=${report.status}`);
    console.log(`SCHEMA=${report.schemaName}`);
    console.log(`CLONED_TABLES=${report.details.clonedTables.length}`);
    console.log(
      `MISSING_SOURCE_TABLES=${report.details.missingSourceTables.length}`,
    );
    if (report.details.verifyResult) {
      console.log(
        `VERIFY_STATUS=${report.details.verifyResult.status} CHECKED=${report.details.verifyResult.checkedTablesCount} FAILURES=${report.details.verifyResult.failuresCount}`,
      );
    }
    for (const warning of report.warnings) {
      console.log(`WARN=${warning}`);
    }
    for (const error of report.errors) {
      console.log(`ERROR=${error}`);
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
  runHomologRls,
};
