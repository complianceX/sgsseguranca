const path = require('path');
const dotenv = require('dotenv');
const { Client } = require('pg');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const TENANT_COLUMNS = ['company_id', 'empresa_id', 'tenant_id'];
const IGNORED_TABLES = new Set(['migrations', 'typeorm_metadata']);

function normalizePolicyFragment(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function hasTenantCondition(policyText, tenantColumns) {
  const normalized = normalizePolicyFragment(policyText);

  return tenantColumns.some((column) => {
    if (column === 'tenant_id') {
      return (
        normalized.includes('tenant_id = current_company()::text') ||
        normalized.includes('tenant_id=current_company()::text') ||
        normalized.includes('tenant_id = current_company( )::text')
      );
    }

    return (
      normalized.includes(`${column} = current_company()`) ||
      normalized.includes(`${column}=current_company()`)
    );
  });
}

function hasSuperAdminCondition(policyText) {
  const normalized = normalizePolicyFragment(policyText);
  return (
    normalized.includes('is_super_admin() = true') ||
    normalized.includes('is_super_admin()=true')
  );
}

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('[verify:rls] DATABASE_URL não configurada.');
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    ssl:
      process.env.DATABASE_SSL === 'true' ||
      process.env.BANCO_DE_DADOS_SSL === 'true' ||
      connectionString.includes('sslmode=require')
        ? { rejectUnauthorized: false }
        : undefined,
  });

  await client.connect();

  try {
    const tablesResult = await client.query(
      `
        SELECT
          c.table_name,
          array_agg(c.column_name ORDER BY c.ordinal_position) AS tenant_columns
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON t.table_schema = c.table_schema
         AND t.table_name = c.table_name
        WHERE c.table_schema = 'public'
          AND t.table_type = 'BASE TABLE'
          AND c.column_name = ANY($1::text[])
        GROUP BY c.table_name
        ORDER BY c.table_name
      `,
      [TENANT_COLUMNS],
    );

    const failures = [];

    for (const row of tablesResult.rows) {
      const tableName = row.table_name;
      if (IGNORED_TABLES.has(tableName)) {
        continue;
      }

      const tenantColumns = row.tenant_columns || [];

      const rlsResult = await client.query(
        `
          SELECT c.relrowsecurity, c.relforcerowsecurity
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
            AND c.relname = $1
        `,
        [tableName],
      );

      const policiesResult = await client.query(
        `
          SELECT policyname, qual, with_check
          FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename = $1
        `,
        [tableName],
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
          const hasSuperAdminWithCheck = hasSuperAdminCondition(policy.with_check);

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
        failures.push({
          tableName,
          tenantColumns,
          issues,
        });
      }
    }

    if (failures.length > 0) {
      console.error('[verify:rls] Inconsistências encontradas:');
      for (const failure of failures) {
        console.error(
          ` - ${failure.tableName} [${failure.tenantColumns.join(', ')}]: ${failure.issues.join('; ')}`,
        );
      }
      process.exit(1);
    }

    console.log(
      `[verify:rls] OK - ${tablesResult.rows.length} tabelas tenant-aware verificadas.`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(
    `[verify:rls] Falha inesperada: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exit(1);
});
