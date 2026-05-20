const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');
const { connectRuntimePgClient } = require('./lib/pg-runtime-client');

function parseArgs(argv) {
  return {
    apply: argv.includes('--apply'),
  };
}

async function setAdminRlsContext(client) {
  await client.query(`SELECT set_config('app.is_super_admin', 'true', false)`);
}

function hashReportIdentifier(value) {
  return crypto
    .createHash('sha256')
    .update(String(value || ''))
    .digest('hex')
    .slice(0, 16);
}

async function main() {
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });

  const options = parseArgs(process.argv.slice(2));
  const { client, databaseConfig } = await connectRuntimePgClient({
    useAdministrativeConfig: true,
  });

  const report = {
    version: 1,
    type: 'backfill_tenant_document_policies',
    mode: options.apply ? 'apply' : 'dry-run',
    target: databaseConfig.target,
    scannedCompanies: 0,
    missingBefore: 0,
    inserted: 0,
    missingAfter: 0,
    missingCompanyRefs: [],
  };

  try {
    await setAdminRlsContext(client);

    const companiesCount = await client.query(`
      SELECT COUNT(*)::int AS total
      FROM companies
    `);
    report.scannedCompanies = Number(companiesCount.rows[0]?.total || 0);

    const before = await client.query(`
      SELECT c.id
      FROM companies c
      WHERE NOT EXISTS (
        SELECT 1
        FROM tenant_document_policies p
        WHERE p.company_id = c.id
      )
      ORDER BY c.created_at ASC NULLS LAST, c.id ASC
    `);

    report.missingBefore = before.rowCount || 0;
    report.missingCompanyRefs = before.rows.map((row) => ({
      idHash: hashReportIdentifier(row.id),
    }));

    if (options.apply && report.missingBefore > 0) {
      const insert = await client.query(`
        INSERT INTO tenant_document_policies (company_id)
        SELECT c.id
        FROM companies c
        WHERE NOT EXISTS (
          SELECT 1
          FROM tenant_document_policies p
          WHERE p.company_id = c.id
        )
        ON CONFLICT (company_id) DO NOTHING
      `);
      report.inserted = insert.rowCount || 0;
    }

    const after = await client.query(`
      SELECT c.id
      FROM companies c
      WHERE NOT EXISTS (
        SELECT 1
        FROM tenant_document_policies p
        WHERE p.company_id = c.id
      )
    `);
    report.missingAfter = after.rowCount || 0;

    console.log(JSON.stringify(report, null, 2));
    if (options.apply && report.missingAfter > 0) {
      process.exitCode = 1;
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
