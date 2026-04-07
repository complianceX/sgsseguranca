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
    options[arg.slice(0, equalIndex)] = arg.slice(equalIndex + 1);
  }
  return options;
}

function createTimestampLabel(date) {
  return date.toISOString().replace(/[:.]/g, '-');
}

async function fetchCount(client, sql) {
  const result = await client.query(sql);
  return Number(result.rows[0]?.total || 0);
}

async function fetchRows(client, sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows;
}

async function runPreMigrationCheck() {
  const report = {
    version: 1,
    type: 'rdo_pre_migration_check',
    startedAt: new Date().toISOString(),
    completedAt: null,
    status: 'fail',
    warnings: [],
    blockers: [],
    checks: {},
  };

  let runtimeConnection = null;
  let client = null;

  try {
    runtimeConnection = await connectRuntimePgClient();
    client = runtimeConnection.client;

    report.warnings.push(...runtimeConnection.warnings);
    report.checks.identity = (
      await client.query(`
        SELECT
          current_database() AS db,
          current_user AS current_user,
          now() AS checked_at
      `)
    ).rows[0];

    const invalidStatusCount = await fetchCount(
      client,
      `
      SELECT COUNT(*)::int AS total
      FROM "rdos"
      WHERE "status" IS NULL
         OR LOWER(BTRIM("status")) NOT IN ('rascunho', 'enviado', 'aprovado', 'cancelado')
      `,
    );
    const invalidStatusSamples = await fetchRows(
      client,
      `
      SELECT id, numero, status
      FROM "rdos"
      WHERE "status" IS NULL
         OR LOWER(BTRIM("status")) NOT IN ('rascunho', 'enviado', 'aprovado', 'cancelado')
      ORDER BY "created_at" DESC
      LIMIT 20
      `,
    );
    report.checks.invalid_status = {
      count: invalidStatusCount,
      samples: invalidStatusSamples,
    };
    if (invalidStatusCount > 0) {
      report.blockers.push(
        `Há ${invalidStatusCount} RDO(s) com status inválido para o domínio enterprise.`,
      );
    }

    const missingReasonCount = await fetchCount(
      client,
      `
      SELECT COUNT(*)::int AS total
      FROM "rdos"
      WHERE "houve_paralisacao" = true
        AND NULLIF(BTRIM(COALESCE("motivo_paralisacao", '')), '') IS NULL
      `,
    );
    const missingReasonSamples = await fetchRows(
      client,
      `
      SELECT id, numero, data
      FROM "rdos"
      WHERE "houve_paralisacao" = true
        AND NULLIF(BTRIM(COALESCE("motivo_paralisacao", '')), '') IS NULL
      ORDER BY data DESC, "created_at" DESC
      LIMIT 20
      `,
    );
    report.checks.houve_paralisacao_sem_motivo = {
      count: missingReasonCount,
      samples: missingReasonSamples,
    };
    if (missingReasonCount > 0) {
      report.blockers.push(
        `Há ${missingReasonCount} RDO(s) com paralisação sem motivo preenchido.`,
      );
    }

    const orphanReasonCount = await fetchCount(
      client,
      `
      SELECT COUNT(*)::int AS total
      FROM "rdos"
      WHERE "houve_paralisacao" = false
        AND NULLIF(BTRIM(COALESCE("motivo_paralisacao", '')), '') IS NOT NULL
      `,
    );
    const orphanReasonSamples = await fetchRows(
      client,
      `
      SELECT id, numero, data, motivo_paralisacao
      FROM "rdos"
      WHERE "houve_paralisacao" = false
        AND NULLIF(BTRIM(COALESCE("motivo_paralisacao", '')), '') IS NOT NULL
      ORDER BY data DESC, "created_at" DESC
      LIMIT 20
      `,
    );
    report.checks.motivo_sem_paralisacao = {
      count: orphanReasonCount,
      samples: orphanReasonSamples,
      autoHealInMigration: true,
    };
    if (orphanReasonCount > 0) {
      report.warnings.push(
        `Há ${orphanReasonCount} RDO(s) com motivo de paralisação preenchido sem flag de paralisação. A migração limpará esse resíduo automaticamente.`,
      );
    }

    const invalidTemperatureCount = await fetchCount(
      client,
      `
      SELECT COUNT(*)::int AS total
      FROM "rdos"
      WHERE "temperatura_min" IS NOT NULL
        AND "temperatura_max" IS NOT NULL
        AND "temperatura_min" > "temperatura_max"
      `,
    );
    const invalidTemperatureSamples = await fetchRows(
      client,
      `
      SELECT id, numero, data, temperatura_min, temperatura_max
      FROM "rdos"
      WHERE "temperatura_min" IS NOT NULL
        AND "temperatura_max" IS NOT NULL
        AND "temperatura_min" > "temperatura_max"
      ORDER BY data DESC, "created_at" DESC
      LIMIT 20
      `,
    );
    report.checks.invalid_temperature_interval = {
      count: invalidTemperatureCount,
      samples: invalidTemperatureSamples,
    };
    if (invalidTemperatureCount > 0) {
      report.blockers.push(
        `Há ${invalidTemperatureCount} RDO(s) com temperatura mínima maior que a máxima.`,
      );
    }

    const structuredPayloads = await fetchRows(
      client,
      `
      SELECT
        SUM(CASE WHEN "mao_de_obra" IS NOT NULL AND jsonb_typeof("mao_de_obra"::jsonb) <> 'array' THEN 1 ELSE 0 END)::int AS mao_de_obra_invalid,
        SUM(CASE WHEN "equipamentos" IS NOT NULL AND jsonb_typeof("equipamentos"::jsonb) <> 'array' THEN 1 ELSE 0 END)::int AS equipamentos_invalid,
        SUM(CASE WHEN "materiais_recebidos" IS NOT NULL AND jsonb_typeof("materiais_recebidos"::jsonb) <> 'array' THEN 1 ELSE 0 END)::int AS materiais_recebidos_invalid,
        SUM(CASE WHEN "servicos_executados" IS NOT NULL AND jsonb_typeof("servicos_executados"::jsonb) <> 'array' THEN 1 ELSE 0 END)::int AS servicos_executados_invalid,
        SUM(CASE WHEN "ocorrencias" IS NOT NULL AND jsonb_typeof("ocorrencias"::jsonb) <> 'array' THEN 1 ELSE 0 END)::int AS ocorrencias_invalid
      FROM "rdos"
      `,
    );
    const payloadStats = structuredPayloads[0] || {};
    report.checks.invalid_structured_payloads = payloadStats;

    for (const [key, value] of Object.entries(payloadStats)) {
      if (Number(value) > 0) {
        report.blockers.push(
          `Há ${value} RDO(s) com payload inválido em ${key.replace(/_invalid$/, '')}; esperado array JSON.`,
        );
      }
    }

    const duplicateNumeroRows = await fetchRows(
      client,
      `
      SELECT company_id, numero, COUNT(*)::int AS total
      FROM "rdos"
      GROUP BY company_id, numero
      HAVING COUNT(*) > 1
      ORDER BY total DESC, numero
      LIMIT 20
      `,
    );
    report.checks.duplicate_company_numero = {
      count: duplicateNumeroRows.length,
      samples: duplicateNumeroRows,
    };
    if (duplicateNumeroRows.length > 0) {
      report.blockers.push(
        'Há duplicidade de número de RDO por empresa; a base precisa ser saneada antes de seguir.',
      );
    }

    report.status = report.blockers.length === 0 ? 'pass' : 'fail';
  } catch (error) {
    report.blockers.push(error instanceof Error ? error.message : String(error));
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
          `rdo-pre-migration-check-${createTimestampLabel(new Date())}.json`,
        );

  const report = await runPreMigrationCheck();

  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf8');

  if (outputJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`STATUS=${report.status}`);
    console.log(`REPORT_FILE=${reportFile}`);
    console.log(`BLOCKERS=${report.blockers.length}`);
    for (const blocker of report.blockers) {
      console.log(`BLOCKER=${blocker}`);
    }
    console.log(`WARNINGS=${report.warnings.length}`);
    for (const warning of report.warnings) {
      console.log(`WARN=${warning}`);
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
  runPreMigrationCheck,
};
