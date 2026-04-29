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
      report.checks.ai_interactions = await queryOne(
        client,
        `
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
    `,
      );
    } catch (error) {
      report.checks.ai_interactions = {
        error: error instanceof Error ? error.message : String(error),
      };
    }

    report.checks.signatures = await queryOne(
      client,
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE signature_data IS NOT NULL)::int AS inline_count,
        COUNT(*) FILTER (WHERE signature_data_key IS NOT NULL)::int AS key_count,
        COUNT(*) FILTER (WHERE signature_data IS NOT NULL AND signature_data_key IS NULL)::int AS inline_without_key,
        COALESCE(MAX(octet_length(signature_data)), 0)::int AS max_inline_bytes
      FROM signatures
    `,
    );

    report.checks.companies_logo = await queryOne(
      client,
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE logo_url LIKE 'data:%')::int AS inline_logo_count,
        COUNT(*) FILTER (WHERE logo_storage_key IS NOT NULL)::int AS key_count,
        COALESCE(MAX(octet_length(logo_url)) FILTER (WHERE logo_url LIKE 'data:%'), 0)::int AS max_inline_bytes
      FROM companies
    `,
    );

    report.checks.apr_legacy = await queryOne(
      client,
      `
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
    `,
    );

    report.checks.writable_without_rls = await queryRows(
      client,
      `
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
    `,
    );

    report.checks.duplicate_indexes = await queryRows(
      client,
      `
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
    `,
    );

    report.checks.id_columns_without_fk = await queryRows(
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
        AND a.attnum > 0
        AND NOT a.attisdropped
        AND a.attname LIKE '%\\_id' ESCAPE '\\'
        AND NOT EXISTS (
          SELECT 1
          FROM pg_inherits inherited
          WHERE inherited.inhrelid = c.oid
        )
        AND NOT EXISTS (
          SELECT 1
          FROM pg_constraint fk
          WHERE fk.conrelid = c.oid
            AND fk.contype = 'f'
            AND a.attnum = ANY(fk.conkey)
        )
      ORDER BY n.nspname, c.relname, a.attname
      LIMIT 300
    `,
    );

    report.checks.fk_without_supporting_index = await queryRows(
      client,
      `
      WITH fk AS (
        SELECT
          con.oid,
          con.conrelid,
          con.conname,
          con.conkey,
          con.conrelid::regclass::text AS table_name,
          con.confrelid::regclass::text AS referenced_table
        FROM pg_constraint con
        JOIN pg_namespace n ON n.oid = con.connamespace
        WHERE con.contype = 'f'
          AND n.nspname = 'public'
      ),
      fk_cols AS (
        SELECT
          fk.*,
          array_agg(att.attname ORDER BY u.ord) AS columns
        FROM fk
        JOIN unnest(fk.conkey) WITH ORDINALITY u(attnum, ord) ON true
        JOIN pg_attribute att
          ON att.attrelid = fk.conrelid
         AND att.attnum = u.attnum
        GROUP BY fk.oid, fk.conrelid, fk.conname, fk.conkey, fk.table_name, fk.referenced_table
      )
      SELECT table_name, conname, columns, referenced_table
      FROM fk_cols f
      WHERE NOT EXISTS (
        SELECT 1
        FROM pg_index i
        WHERE i.indrelid = f.conrelid
          AND i.indisvalid
          AND (i.indkey::int2[])[0:array_length(f.conkey, 1) - 1] = f.conkey
      )
      ORDER BY table_name, conname
    `,
    );

    report.checks.ai_interaction_partitions = await queryRows(
      client,
      `
      SELECT
        child.relname AS partition_name,
        pg_get_expr(child.relpartbound, child.oid) AS partition_bound,
        COALESCE(st.n_live_tup, 0)::bigint AS live_rows
      FROM pg_inherits i
      JOIN pg_class parent ON parent.oid = i.inhparent
      JOIN pg_class child ON child.oid = i.inhrelid
      LEFT JOIN pg_stat_user_tables st ON st.relid = child.oid
      WHERE parent.oid = 'public.ai_interactions'::regclass
      ORDER BY child.relname
    `,
    );

    report.checks.bloat_observability = await queryRows(
      client,
      `
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
    `,
    );

    report.checks.unused_indexes_observability = await queryRows(
      client,
      `
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
    `,
    );

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
  console.log(
    `C04 companies_logo: ${JSON.stringify(report.checks.companies_logo)}`,
  );
  console.log(`H06 apr_legacy: ${JSON.stringify(report.checks.apr_legacy)}`);
  console.log(
    `C02 writable_without_rls: ${report.checks.writable_without_rls.length}`,
  );
  console.log(
    `H05 duplicate_indexes: ${report.checks.duplicate_indexes.length}`,
  );
  console.log(
    `H07 id_columns_without_fk: ${report.checks.id_columns_without_fk.length}`,
  );
  console.log(
    `H07 fk_without_supporting_index: ${report.checks.fk_without_supporting_index.length}`,
  );
  console.log(
    `H09 ai_interaction_partitions: ${report.checks.ai_interaction_partitions.length}`,
  );
  console.log(`H09 bloat_rows: ${report.checks.bloat_observability.length}`);
  console.log(
    `H09 unused_index_rows: ${report.checks.unused_indexes_observability.length}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
