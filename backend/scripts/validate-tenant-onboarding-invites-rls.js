const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');
const { connectRuntimePgClient } = require('./lib/pg-runtime-client');

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function randomDigits(length) {
  let result = '';
  while (result.length < length) {
    result += Math.floor(Math.random() * 10).toString();
  }
  return result.slice(0, length);
}

async function main() {
  let connection;
  try {
    connection = await connectRuntimePgClient();
    const client = connection.client;

    const tokenHash = crypto
      .createHash('sha256')
      .update(`rls-${Date.now()}-${Math.random()}`)
      .digest('hex');

    await client.query('BEGIN');
    await client.query("SELECT set_config('app.is_super_admin', 'true', true)");

    const companyA = await client.query(
      `INSERT INTO companies (razao_social, cnpj, endereco, responsavel, status)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id`,
      [
        `SGS TEMP TENANT A ${Date.now()}`,
        randomDigits(14),
        'Endereco temporario A',
        'Responsavel temporario A',
      ],
    );

    const companyB = await client.query(
      `INSERT INTO companies (razao_social, cnpj, endereco, responsavel, status)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id`,
      [
        `SGS TEMP TENANT B ${Date.now()}`,
        randomDigits(14),
        'Endereco temporario B',
        'Responsavel temporario B',
      ],
    );

    const tenantA = companyA.rows[0].id;
    const tenantB = companyB.rows[0].id;

    await client.query("SELECT set_config('app.current_company_id', $1, true)", [
      tenantA,
    ]);
    await client.query(
      `INSERT INTO tenant_onboarding_invites (token_hash, email, expires_at, created_company_id, created_user_id)
       VALUES ($1, $2, NOW() + INTERVAL '1 day', $3, NULL)`,
      [tokenHash, 'rls-validation@sgs.local', tenantA],
    );

    await client.query("SELECT set_config('app.is_super_admin', 'false', true)");
    await client.query("SELECT set_config('app.current_company_id', $1, true)", [
      tenantA,
    ]);
    const sameTenant = await client.query(
      'SELECT count(*)::int AS total FROM tenant_onboarding_invites WHERE token_hash = $1',
      [tokenHash],
    );

    await client.query("SELECT set_config('app.current_company_id', $1, true)", [
      tenantB,
    ]);
    const otherTenant = await client.query(
      'SELECT count(*)::int AS total FROM tenant_onboarding_invites WHERE token_hash = $1',
      [tokenHash],
    );

    await client.query("SELECT set_config('app.is_super_admin', 'true', true)");
    const superAdmin = await client.query(
      'SELECT count(*)::int AS total FROM tenant_onboarding_invites WHERE token_hash = $1',
      [tokenHash],
    );

    await client.query('ROLLBACK');

    const visibility = {
      sameTenant: sameTenant.rows[0].total,
      otherTenant: otherTenant.rows[0].total,
      superAdmin: superAdmin.rows[0].total,
    };
    const ok =
      visibility.sameTenant === 1 &&
      visibility.otherTenant === 0 &&
      visibility.superAdmin === 1;

    const report = {
      ok,
      tenantA,
      tenantB,
      visibility,
    };

    console.log(JSON.stringify(report, null, 2));

    if (!ok) {
      process.exitCode = 1;
    }
  } catch (error) {
    if (connection?.client) {
      try {
        await connection.client.query('ROLLBACK');
      } catch {
        // noop
      }
    }

    console.error(
      '[RLS:ONBOARDING:VALIDATE] Failed:',
      error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
  } finally {
    if (connection?.client) {
      await connection.client.end().catch(() => undefined);
    }
  }
}

main();
