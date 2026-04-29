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
  return {
    json: argv.includes('--json'),
    admin: argv.includes('--admin'),
  };
}

async function queryOne(client, sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows[0] || {};
}

async function queryRows(client, sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows;
}

async function setAdminRlsContext(client) {
  await client.query(`SELECT set_config('app.is_super_admin', 'true', false)`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { client, databaseConfig, warnings } = await connectRuntimePgClient({
    useAdministrativeConfig: options.admin,
  });

  const report = {
    version: 1,
    type: 'database_remediation_audit',
    generatedAt: new Date().toISOString(),
    target: databaseConfig.target,
    warnings,
    checks: {},
  };

  try {
    await setAdminRlsContext(client);

    try {
    report.checks.ai_interactions = await queryOne(client, `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE tenant_id IS NOT NULL)::int AS tenant_id_present,
        COUNT(*) FILTER (WHERE tenant_uuid IS NOT NULL)::int AS tenant_uuid_present,
        COUNT(*) FILTER (WHERE tenant_uuid IS NOT NULL AND c.id IS NOT NULL)::int AS tenant_uuid_valid,
        COUNT(*) FILTER (WHERE user_uuid IS NOT NULL)::int AS user_uuid_present,
        COUNT(*) FILTER (WHERE user_uuid IS NOT NULL AND u.id IS NOT NULL)::int AS user_uuid_valid,
        COUNT(*) FILTER (WHERE user_ref_status = 'valid_user')::int AS valid_user_refs,
        COUNT(*) FILTER (WHERE user_ref_status = 'missing_user')::int AS missing_user_refs,
        COUNT(*) FILTER (WHERE user_ref_status = 'invalid_uuid')::int AS invalid_user_uuid_refs,
        COUNT(*) FILTER (WHERE user_ref_status IS NULL OR user_ref_status = 'unclassified')::int AS unclassified_user_refs
      FROM ai_interactions ai
      LEFT JOIN companies c ON c.id = ai.tenant_uuid
      LEFT JOIN users u ON u.id = ai.user_uuid
    `);
    } catch (error) {
      report.checks.ai_interactions = {
        error: error instanceof Error ? error.message : String(error),
      };
    }

    report.checks.signatures = await queryOne(client, `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE signature_data IS NOT NULL)::int AS inline_count,
        COUNT(*) FILTER (WHERE signature_data_key IS NOT NULL)::int AS key_count,
        COUNT(*) FILTER (WHERE signature_data IS NOT NULL AND signature_data_key IS NULL)::int AS inline_without_key,
        COALESCE(MAX(octet_length(signature_data)), 0)::int AS max_inline_bytes
      FROM signatures
    `);

    report.checks.companies_logo = await queryOne(client, `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE logo_url LIKE 'data:%')::int AS inline_logo_count,
        COUNT(*) FILTER (WHERE logo_storage_key IS NOT NULL)::int AS key_count,
        COALESCE(MAX(octet_length(logo_url)) FILTER (WHERE logo_url LIKE 'data:%'), 0)::int AS max_inline_bytes
      FROM companies
    `);

    report.checks.apr_legacy = await queryOne(client, `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (
          WHERE itens_risco IS NOT NULL
            AND btrim(itens_risco::text) NOT IN ('', '[]', '{}', 'null')
        )::int AS with_legacy_items,
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM apr_risk_items item WHERE item.apr_id = aprs.id
        ))::int AS with_structured_items
      FROM aprs
    `);

    report.checks.writable_without_rls = await queryRows(client, `
      SELECT
        n.nspname AS schema_name,
        c.relname AS table_name,
        bool_or(privilege_type IN ('INSERT', 'UPDATE', 'DELETE')) AS writable
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN information_schema.role_table_grants g
        ON g.table_schema = n.nspname
       AND g.table_name = c.relname
       AND g.grantee = 'sgs_app'
      WHERE c.relkind IN ('r', 'p')
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND c.relrowsecurity = false
      GROUP BY n.nspname, c.relname
      HAVING bool_or(privilege_type IN ('INSERT', 'UPDATE', 'DELETE'))
      ORDER BY n.nspname, c.relname
    `);

    report.checks.duplicate_indexes = await queryRows(client, `
      WITH index_defs AS (
        SELECT
          schemaname,
          tablename,
          indexname,
          regexp_replace(indexdef, 'INDEX [^ ]+ ', 'INDEX ', 'i') AS normalized_def
        FROM pg_indexes
      )
      SELECT
        schemaname,
        tablename,
        normalized_def,
        array_agg(indexname ORDER BY indexname) AS indexes
      FROM index_defs
      GROUP BY schemaname, tablename, normalized_def
      HAVING COUNT(*) > 1
      ORDER BY schemaname, tablename
    `);

    report.checks.id_columns_without_fk = await queryRows(client, `
      SELECT
        c.table_schema,
        c.table_name,
        c.column_name,
        c.data_type
      FROM information_schema.columns c
      LEFT JOIN information_schema.key_column_usage kcu
        ON kcu.table_schema = c.table_schema
       AND kcu.table_name = c.table_name
       AND kcu.column_name = c.column_name
      LEFT JOIN information_schema.table_constraints tc
        ON tc.constraint_schema = kcu.constraint_schema
       AND tc.constraint_name = kcu.constraint_name
       AND tc.constraint_type = 'FOREIGN KEY'
      WHERE c.table_schema = 'public'
        AND c.column_name LIKE '%\\_id' ESCAPE '\\'
        AND tc.constraint_name IS NULL
      ORDER BY c.table_schema, c.table_name, c.column_name
      LIMIT 300
    `);

    report.checks.bloat_observability = await queryRows(client, `
      SELECT
        schemaname,
        relname,
        n_live_tup,
        n_dead_tup,
        last_vacuum,
        last_autovacuum,
        last_analyze,
        last_autoanalyze
      FROM pg_stat_user_tables
      WHERE n_dead_tup > 0
      ORDER BY n_dead_tup DESC
      LIMIT 25
    `);

    report.checks.unused_indexes_observability = await queryRows(client, `
      SELECT
        schemaname,
        relname AS table_name,
        indexrelname AS index_name,
        idx_scan,
        pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
      FROM pg_stat_user_indexes
      WHERE idx_scan = 0
      ORDER BY pg_relation_size(indexrelid) DESC
      LIMIT 25
    `);

    report.status = 'ok';
  } finally {
    await client.end();
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`Database remediation audit: ${report.status}`);
  console.log(`Target: ${report.target}`);
  console.log(
    `C01 ai_interactions: ${JSON.stringify(report.checks.ai_interactions)}`,
  );
  console.log(`C03 signatures: ${JSON.stringify(report.checks.signatures)}`);
  console.log(`C04 companies_logo: ${JSON.stringify(report.checks.companies_logo)}`);
  console.log(`H06 apr_legacy: ${JSON.stringify(report.checks.apr_legacy)}`);
  console.log(
    `C02 writable_without_rls: ${report.checks.writable_without_rls.length}`,
  );
  console.log(`H05 duplicate_indexes: ${report.checks.duplicate_indexes.length}`);
  console.log(`H07 id_columns_without_fk: ${report.checks.id_columns_without_fk.length}`);
  console.log(`H09 bloat_rows: ${report.checks.bloat_observability.length}`);
  console.log(
    `H09 unused_index_rows: ${report.checks.unused_indexes_observability.length}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
