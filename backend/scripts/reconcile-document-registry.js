require('reflect-metadata');
const { DataSource } = require('typeorm');
const fs = require('fs');
const path = require('path');

function loadEnvFromFile() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }

  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

loadEnvFromFile();

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

function resolveSslConfig() {
  const isProduction = process.env.NODE_ENV === 'production';
  const hasDatabaseUrl = !!firstNonEmpty(
    process.env.DATABASE_URL,
    process.env.DATABASE_PUBLIC_URL,
    process.env.URL_DO_BANCO_DE_DADOS,
  );
  const railwaySelfSigned = process.env.BANCO_DE_DADOS_SSL === 'true';
  const sslEnabled = process.env.DATABASE_SSL === 'true';
  const sslCA = process.env.DATABASE_SSL_CA;

  if (!isProduction) {
    return sslEnabled ? { rejectUnauthorized: false } : false;
  }

  if (railwaySelfSigned) {
    return { rejectUnauthorized: false };
  }

  if (hasDatabaseUrl && !sslCA) {
    return { rejectUnauthorized: false };
  }

  if (!sslEnabled) {
    return false;
  }

  if (sslCA) {
    return { rejectUnauthorized: true, ca: sslCA };
  }

  return { rejectUnauthorized: true };
}

function describeDatabaseTarget(url) {
  if (!url) {
    return 'target=unknown';
  }

  try {
    const parsed = new URL(url);
    const databaseName = parsed.pathname.replace(/^\//, '') || '(default)';
    return `host=${parsed.hostname} port=${parsed.port || '5432'} db=${databaseName}`;
  } catch {
    return 'target=invalid-url';
  }
}

function buildDataSource() {
  const databaseUrl = firstNonEmpty(
    process.env.DATABASE_URL,
    process.env.DATABASE_PRIVATE_URL,
    process.env.DATABASE_PUBLIC_URL,
    process.env.URL_DO_BANCO_DE_DADOS,
    process.env.POSTGRES_URL,
    process.env.POSTGRESQL_URL,
  );

  if (databaseUrl) {
    console.log(
      `[REGISTRY] Using database URL from environment (${describeDatabaseTarget(databaseUrl)}).`,
    );
    return new DataSource({
      type: 'postgres',
      url: databaseUrl,
      ssl: resolveSslConfig(),
    });
  }

  const host = firstNonEmpty(
    process.env.DATABASE_HOST,
    process.env.PGHOST,
    process.env.POSTGRES_HOST,
  );
  const port = Number(
    firstNonEmpty(
      process.env.DATABASE_PORT,
      process.env.PGPORT,
      process.env.POSTGRES_PORT,
    ) || '5432',
  );
  const username = firstNonEmpty(
    process.env.DATABASE_USER,
    process.env.PGUSER,
    process.env.POSTGRES_USER,
  );
  const password = firstNonEmpty(
    process.env.DATABASE_PASSWORD,
    process.env.PGPASSWORD,
    process.env.POSTGRES_PASSWORD,
  );
  const database = firstNonEmpty(
    process.env.DATABASE_NAME,
    process.env.PGDATABASE,
    process.env.POSTGRES_DB,
  );

  if (!host || !username || !password || !database) {
    throw new Error(
      'Database config missing. Set DATABASE_URL (recommended) or DATABASE_HOST/PORT/USER/PASSWORD/NAME.',
    );
  }

  console.log(
    `[REGISTRY] Using host credentials (${username}@${host}:${port}/${database}).`,
  );
  return new DataSource({
    type: 'postgres',
    host,
    port,
    username,
    password,
    database,
    ssl: resolveSslConfig(),
  });
}

function parseArgs(argv) {
  const args = {
    apply: false,
    companyId: undefined,
    modules: undefined,
  };

  for (const rawArg of argv) {
    const arg = String(rawArg || '').trim();
    if (!arg) continue;

    if (arg === '--apply') {
      args.apply = true;
      continue;
    }
    if (arg === '--dry-run') {
      args.apply = false;
      continue;
    }
    if (arg.startsWith('--company=')) {
      args.companyId = arg.slice('--company='.length).trim() || undefined;
      continue;
    }
    if (arg.startsWith('--modules=')) {
      const modules = arg
        .slice('--modules='.length)
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
      args.modules = modules.length > 0 ? modules : undefined;
    }
  }

  return args;
}

const MODULES = [
  {
    module: 'apr',
    label: 'APR',
    table: 'aprs',
    titleExpr: `COALESCE(NULLIF(src.titulo, ''), NULLIF(src.numero, ''), 'APR')`,
    dateExpr: `COALESCE(src.data_inicio::timestamp, src.created_at)`,
    codePrefix: 'APR',
  },
  {
    module: 'pt',
    label: 'PT',
    table: 'pts',
    titleExpr: `COALESCE(NULLIF(src.titulo, ''), NULLIF(src.numero, ''), 'PT')`,
    dateExpr: `COALESCE(src.data_hora_inicio, src.created_at)`,
    codePrefix: 'PT',
  },
  {
    module: 'dds',
    label: 'DDS',
    table: 'dds',
    titleExpr: `COALESCE(NULLIF(src.tema, ''), 'DDS')`,
    dateExpr: `COALESCE(src.data::timestamp, src.created_at)`,
    codePrefix: 'DDS',
  },
  {
    module: 'checklist',
    label: 'Checklist',
    table: 'checklists',
    titleExpr: `COALESCE(NULLIF(src.titulo, ''), 'Checklist')`,
    dateExpr: `COALESCE(src.data::timestamp, src.created_at)`,
    codePrefix: 'CHK',
  },
  {
    module: 'audit',
    label: 'Auditoria',
    table: 'audits',
    titleExpr: `COALESCE(NULLIF(src.titulo, ''), 'Auditoria')`,
    dateExpr: `COALESCE(src.data_auditoria::timestamp, src.created_at)`,
    codePrefix: 'AUD',
  },
  {
    module: 'nonconformity',
    label: 'Nao Conformidade',
    table: 'nonconformities',
    titleExpr: `COALESCE(NULLIF(src.codigo_nc, ''), NULLIF(src.tipo, ''), 'Nao Conformidade')`,
    dateExpr: `COALESCE(src.data_identificacao::timestamp, src.created_at)`,
    codePrefix: 'NC',
  },
];

async function countSourceRows(queryRunner, config, companyId) {
  const rows = await queryRunner.query(
    `
      SELECT COUNT(*)::int AS total
      FROM "${config.table}" src
      WHERE src.pdf_file_key IS NOT NULL
        ${companyId ? 'AND src.company_id = $1' : ''}
    `,
    companyId ? [companyId] : [],
  );

  return Number(rows[0]?.total ?? 0);
}

async function countRegistryRows(queryRunner, moduleName, companyId) {
  const rows = await queryRunner.query(
    `
      SELECT COUNT(*)::int AS total
      FROM document_registry dr
      WHERE dr.module = $1
        AND dr.document_type = 'pdf'
        ${companyId ? 'AND dr.company_id = $2' : ''}
    `,
    companyId ? [moduleName, companyId] : [moduleName],
  );

  return Number(rows[0]?.total ?? 0);
}

async function countStaleRows(queryRunner, config, companyId) {
  const params = companyId ? [config.module, companyId] : [config.module];
  const companyFilter = companyId ? 'AND dr.company_id = $2' : '';
  const sourceCompanyFilter = companyId ? 'AND src.company_id = $2' : '';

  const rows = await queryRunner.query(
    `
      SELECT COUNT(*)::int AS total
      FROM document_registry dr
      WHERE dr.module = $1
        AND dr.document_type = 'pdf'
        ${companyFilter}
        AND NOT EXISTS (
          SELECT 1
          FROM "${config.table}" src
          WHERE src.id = dr.entity_id
            AND src.company_id = dr.company_id
            AND src.pdf_file_key IS NOT NULL
            ${sourceCompanyFilter}
        )
    `,
    params,
  );

  return Number(rows[0]?.total ?? 0);
}

async function reconcileModule(queryRunner, config, companyId) {
  const sourceCompanyClause = companyId ? 'WHERE src.pdf_file_key IS NOT NULL AND src.company_id = $1' : 'WHERE src.pdf_file_key IS NOT NULL';
  const registryCompanyClause = companyId ? 'AND dr.company_id = $2' : '';
  const sourceCompanyInDeleteClause = companyId ? 'AND src.company_id = $2' : '';
  const params = companyId ? [companyId, config.module] : [config.module];

  const sourceCountBefore = await countSourceRows(queryRunner, config, companyId);
  const registryCountBefore = await countRegistryRows(
    queryRunner,
    config.module,
    companyId,
  );
  const staleCount = await countStaleRows(queryRunner, config, companyId);

  await queryRunner.query(
    `
      INSERT INTO document_registry (
        company_id,
        module,
        document_type,
        entity_id,
        title,
        document_date,
        iso_year,
        iso_week,
        file_key,
        folder_path,
        original_name,
        mime_type,
        document_code,
        created_at,
        updated_at
      )
      SELECT
        src.company_id,
        $${companyId ? '2' : '1'}::varchar,
        'pdf',
        src.id,
        ${config.titleExpr},
        ${config.dateExpr},
        EXTRACT(ISOYEAR FROM ${config.dateExpr})::int,
        EXTRACT(WEEK FROM ${config.dateExpr})::int,
        src.pdf_file_key,
        src.pdf_folder_path,
        src.pdf_original_name,
        'application/pdf',
        '${config.codePrefix}-' || EXTRACT(ISOYEAR FROM ${config.dateExpr})::int || '-' ||
          LPAD(EXTRACT(WEEK FROM ${config.dateExpr})::int::text, 2, '0') || '-' ||
          UPPER(SUBSTRING(src.id::text, 1, 8)),
        src.created_at,
        NOW()
      FROM "${config.table}" src
      ${sourceCompanyClause}
      ON CONFLICT (module, entity_id, document_type) DO UPDATE
      SET
        company_id = EXCLUDED.company_id,
        title = EXCLUDED.title,
        document_date = EXCLUDED.document_date,
        iso_year = EXCLUDED.iso_year,
        iso_week = EXCLUDED.iso_week,
        file_key = EXCLUDED.file_key,
        folder_path = EXCLUDED.folder_path,
        original_name = EXCLUDED.original_name,
        mime_type = EXCLUDED.mime_type,
        file_hash = CASE
          WHEN document_registry.file_key IS DISTINCT FROM EXCLUDED.file_key THEN NULL
          ELSE document_registry.file_hash
        END,
        document_code = COALESCE(document_registry.document_code, EXCLUDED.document_code),
        updated_at = NOW()
    `,
    params,
  );

  await queryRunner.query(
    `
      DELETE FROM document_registry dr
      WHERE dr.module = $1
        AND dr.document_type = 'pdf'
        ${registryCompanyClause}
        AND NOT EXISTS (
          SELECT 1
          FROM "${config.table}" src
          WHERE src.id = dr.entity_id
            AND src.company_id = dr.company_id
            AND src.pdf_file_key IS NOT NULL
            ${sourceCompanyInDeleteClause}
        )
    `,
    companyId ? [config.module, companyId] : [config.module],
  );

  const registryCountAfter = await countRegistryRows(
    queryRunner,
    config.module,
    companyId,
  );

  return {
    module: config.module,
    label: config.label,
    sourceCountBefore,
    registryCountBefore,
    registryCountAfter,
    staleCount,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const selectedModules = args.modules?.length
    ? MODULES.filter((item) => args.modules.includes(item.module))
    : MODULES;

  if (selectedModules.length === 0) {
    throw new Error('No valid modules selected. Use --modules=apr,pt,dds,audit,...');
  }

  console.log(
    `[REGISTRY] Starting reconciliation in ${args.apply ? 'APPLY' : 'DRY-RUN'} mode for modules: ${selectedModules
      .map((item) => item.module)
      .join(', ')}${args.companyId ? ` | company=${args.companyId}` : ''}`,
  );

  const dataSource = buildDataSource();
  const queryRunner = dataSource.createQueryRunner();

  try {
    await dataSource.initialize();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    await queryRunner.query("SET LOCAL app.is_super_admin = 'true'");
    await queryRunner.query('SELECT pg_advisory_xact_lock($1)', [170900000041]);

    const summary = [];
    for (const config of selectedModules) {
      const result = await reconcileModule(queryRunner, config, args.companyId);
      summary.push(result);
      console.log(
        `[REGISTRY] ${config.label}: source=${result.sourceCountBefore} registry(before=${result.registryCountBefore}, after=${result.registryCountAfter}) stale=${result.staleCount}`,
      );
    }

    if (args.apply) {
      await queryRunner.commitTransaction();
      console.log('[REGISTRY] Reconciliation committed successfully.');
    } else {
      await queryRunner.rollbackTransaction();
      console.log('[REGISTRY] Dry-run finished. No changes were committed.');
    }

    const totals = summary.reduce(
      (acc, item) => {
        acc.source += item.sourceCountBefore;
        acc.registryBefore += item.registryCountBefore;
        acc.registryAfter += item.registryCountAfter;
        acc.stale += item.staleCount;
        return acc;
      },
      { source: 0, registryBefore: 0, registryAfter: 0, stale: 0 },
    );

    console.log(
      `[REGISTRY] Totals: source=${totals.source} registry(before=${totals.registryBefore}, after=${totals.registryAfter}) stale=${totals.stale}`,
    );
  } finally {
    if (queryRunner.isTransactionActive) {
      await queryRunner.rollbackTransaction();
    }
    if (!queryRunner.isReleased) {
      await queryRunner.release();
    }
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

main().catch((err) => {
  console.error('[REGISTRY] Failed:', err.message || err);
  process.exit(1);
});
