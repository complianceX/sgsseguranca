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

function normalizeQueryPlanRow(result) {
  const raw = result.rows[0];
  if (!raw) {
    throw new Error('EXPLAIN não retornou plano.');
  }

  const planValue = raw['QUERY PLAN'];
  if (!Array.isArray(planValue) || !planValue[0]) {
    throw new Error('Formato inesperado do plano retornado pelo PostgreSQL.');
  }

  return planValue[0];
}

function walkPlan(node, collector) {
  if (!node || typeof node !== 'object') {
    return;
  }

  collector.nodeTypes.add(node['Node Type']);
  if (node['Relation Name']) {
    collector.relations.add(node['Relation Name']);
  }
  if (node['Index Name']) {
    collector.indexes.add(node['Index Name']);
  }
  if (node['Node Type'] === 'Seq Scan' && node['Relation Name']) {
    collector.seqScans.push(node['Relation Name']);
  }
  if (
    ['Index Scan', 'Index Only Scan', 'Bitmap Index Scan', 'Bitmap Heap Scan'].includes(
      node['Node Type'],
    )
  ) {
    collector.indexAccess.push({
      nodeType: node['Node Type'],
      relation: node['Relation Name'] || null,
      index: node['Index Name'] || null,
    });
  }

  for (const child of node.Plans || []) {
    walkPlan(child, collector);
  }
}

function summarizeExplainPlan(payload) {
  const rootPlan = payload.Plan;
  const collector = {
    nodeTypes: new Set(),
    relations: new Set(),
    indexes: new Set(),
    seqScans: [],
    indexAccess: [],
  };
  walkPlan(rootPlan, collector);

  return {
    planningTimeMs: Number(payload['Planning Time'] || 0),
    executionTimeMs: Number(payload['Execution Time'] || 0),
    executionTimeHuman: `${Number(payload['Execution Time'] || 0).toFixed(3)} ms`,
    actualRows: Number(rootPlan?.['Actual Rows'] || 0),
    planRows: Number(rootPlan?.['Plan Rows'] || 0),
    totalCost: Number(rootPlan?.['Total Cost'] || 0),
    sharedHitBlocks: Number(rootPlan?.['Shared Hit Blocks'] || 0),
    sharedReadBlocks: Number(rootPlan?.['Shared Read Blocks'] || 0),
    tempReadBlocks: Number(rootPlan?.['Temp Read Blocks'] || 0),
    tempWrittenBlocks: Number(rootPlan?.['Temp Written Blocks'] || 0),
    nodeTypes: Array.from(collector.nodeTypes).sort(),
    relations: Array.from(collector.relations).sort(),
    indexes: Array.from(collector.indexes).sort(),
    seqScans: Array.from(new Set(collector.seqScans)).sort(),
    indexAccess: collector.indexAccess,
  };
}

async function explainQuery(client, input) {
  const explainSql = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${input.sql}`;
  const normalResult = await client.query(explainSql, input.params);
  const normalPlan = normalizeQueryPlanRow(normalResult);
  const summary = summarizeExplainPlan(normalPlan);

  let forcedIndexSummary = null;
  if (summary.seqScans.includes('rdos')) {
    await client.query('BEGIN');
    try {
      await client.query('SET LOCAL enable_seqscan = off');
      const forcedResult = await client.query(explainSql, input.params);
      forcedIndexSummary = summarizeExplainPlan(
        normalizeQueryPlanRow(forcedResult),
      );
      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    }
  }

  return {
    name: input.name,
    description: input.description,
    sql: input.sql,
    params: input.params,
    actualPlan: summary,
    forcedIndexPlan: forcedIndexSummary,
  };
}

async function resolveScope(client, requestedCompanyId, requestedSiteId) {
  if (requestedCompanyId) {
    const res = await client.query(
      `
        SELECT
          company_id,
          site_id,
          COUNT(*)::int AS total
        FROM rdos
        WHERE company_id = $1
        GROUP BY company_id, site_id
        ORDER BY total DESC, site_id NULLS LAST
        LIMIT 1
      `,
      [requestedCompanyId],
    );
    const row = res.rows[0] || null;
    if (!row) {
      throw new Error(
        `Nao existem RDOs para a company_id informada: ${requestedCompanyId}`,
      );
    }

    return {
      companyId: requestedCompanyId,
      siteId: requestedSiteId || row.site_id || null,
      tenantTotal: Number(row.total || 0),
    };
  }

  const scopeResult = await client.query(`
    SELECT
      company_id,
      site_id,
      COUNT(*)::int AS total
    FROM rdos
    GROUP BY company_id, site_id
    ORDER BY total DESC, company_id, site_id NULLS LAST
    LIMIT 1
  `);
  const scopeRow = scopeResult.rows[0] || null;
  if (!scopeRow) {
    throw new Error('Nao existem RDOs para auditar na base atual.');
  }

  return {
    companyId: scopeRow.company_id,
    siteId: requestedSiteId || scopeRow.site_id || null,
    tenantTotal: Number(scopeRow.total || 0),
  };
}

async function fetchIdentity(client) {
  const res = await client.query(`
    SELECT
      current_database() AS db,
      current_user AS current_user,
      version() AS version,
      now() AS checked_at,
      current_setting('shared_preload_libraries', true) AS shared_preload_libraries
  `);
  return res.rows[0];
}

async function fetchTableStats(client) {
  const res = await client.query(`
    SELECT
      c.reltuples::bigint AS estimated_rows,
      pg_total_relation_size(c.oid) AS total_bytes,
      pg_relation_size(c.oid) AS table_bytes
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'rdos'
  `);
  return res.rows[0] || null;
}

async function fetchPgStatStatementsStatus(client) {
  const extensionResult = await client.query(`
    SELECT EXISTS (
      SELECT 1
      FROM pg_extension
      WHERE extname = 'pg_stat_statements'
    ) AS installed
  `);
  const installed = Boolean(extensionResult.rows[0]?.installed);
  if (!installed) {
    return {
      installed: false,
      available: false,
      message:
        'A extensao pg_stat_statements nao esta instalada nesta base. O diagnostico foi feito apenas com EXPLAIN.',
      topStatements: [],
    };
  }

  try {
    const statsResult = await client.query(`
      SELECT
        queryid,
        calls,
        ROUND(total_exec_time::numeric, 3) AS total_exec_time_ms,
        ROUND(mean_exec_time::numeric, 3) AS mean_exec_time_ms,
        rows,
        shared_blks_hit,
        shared_blks_read,
        query
      FROM pg_stat_statements
      WHERE query ILIKE '%rdos%'
         OR query ILIKE '%rdo.%'
         OR query ILIKE '%FROM "rdos"%'
         OR query ILIKE '%FROM rdos%'
      ORDER BY total_exec_time DESC
      LIMIT 10
    `);
    return {
      installed: true,
      available: true,
      message: 'pg_stat_statements disponivel para correlacao com carga real.',
      topStatements: statsResult.rows,
    };
  } catch (error) {
    return {
      installed: true,
      available: false,
      message:
        error instanceof Error
          ? error.message
          : 'Falha ao consultar pg_stat_statements.',
      topStatements: [],
    };
  }
}

async function fetchIndexCatalog(client) {
  const result = await client.query(`
    SELECT
      indexname,
      indexdef,
      pg_size_pretty(pg_relation_size((quote_ident(schemaname) || '.' || quote_ident(indexname))::regclass)) AS size
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'rdos'
    ORDER BY indexname
  `);
  return result.rows;
}

async function runAudit(options = {}) {
  const report = {
    version: 1,
    type: 'rdo_performance_audit',
    startedAt: new Date().toISOString(),
    completedAt: null,
    status: 'fail',
    warnings: [],
    findings: [],
    identity: null,
    scope: null,
    tableStats: null,
    pgStatStatements: null,
    indexes: [],
    explainPlans: [],
  };

  let runtimeConnection = null;
  let client = null;

  try {
    runtimeConnection = await connectRuntimePgClient();
    client = runtimeConnection.client;
    report.warnings.push(...runtimeConnection.warnings);

    report.identity = await fetchIdentity(client);
    report.tableStats = await fetchTableStats(client);
    report.scope = await resolveScope(
      client,
      options.companyId || null,
      options.siteId || null,
    );
    report.pgStatStatements = await fetchPgStatStatementsStatus(client);
    report.indexes = await fetchIndexCatalog(client);

    const tenantRow = await client.query(
      `
        SELECT
          COALESCE(MIN(data), CURRENT_DATE)::date AS min_data,
          COALESCE(MAX(data), CURRENT_DATE)::date AS max_data
        FROM rdos
        WHERE company_id = $1
      `,
      [report.scope.companyId],
    );
    const minDate = tenantRow.rows[0]?.min_data;
    const maxDate = tenantRow.rows[0]?.max_data;

    const queryMatrix = [
      {
        name: 'list_default',
        description:
          'Listagem principal do RDO por tenant, ordenando por data, created_at e id.',
        sql: `
          SELECT rdo.id
          FROM rdos rdo
          WHERE rdo.company_id = $1
          ORDER BY rdo.data DESC, rdo.created_at DESC, rdo.id DESC
          LIMIT 20 OFFSET 0
        `,
        params: [report.scope.companyId],
      },
      {
        name: 'list_count',
        description: 'Contagem da paginação do RDO por tenant.',
        sql: `
          SELECT COUNT(*)::int AS total
          FROM rdos rdo
          WHERE rdo.company_id = $1
        `,
        params: [report.scope.companyId],
      },
      {
        name: 'calendar_window',
        description:
          'Consulta do calendario do RDO filtrando tenant e janela de datas.',
        sql: `
          SELECT rdo.id, rdo.numero, rdo.data, rdo.status
          FROM rdos rdo
          WHERE rdo.company_id = $1
            AND rdo.data BETWEEN $2::date AND $3::date
          ORDER BY rdo.data DESC
        `,
        params: [report.scope.companyId, minDate, maxDate],
      },
      {
        name: 'pending_pdf_queue',
        description:
          'Pendencia documental do RDO sem PDF final, usada em dashboard e fila operacional.',
        sql: `
          SELECT rdo.id, rdo.company_id, rdo.site_id, rdo.numero, rdo.status, rdo.updated_at
          FROM rdos rdo
          WHERE rdo.company_id = $1
            AND rdo.status IN ('enviado', 'aprovado')
            AND rdo.pdf_file_key IS NULL
          ORDER BY rdo.updated_at DESC, rdo.id DESC
        `,
        params: [report.scope.companyId],
      },
      {
        name: 'analytics_overview',
        description:
          'Overview analitico consolidado do RDO com COUNT FILTER por status.',
        sql: `
          SELECT
            COUNT(*)::int AS total_rdos,
            COUNT(*) FILTER (WHERE rdo.status = 'rascunho')::int AS rascunho,
            COUNT(*) FILTER (WHERE rdo.status = 'enviado')::int AS enviado,
            COUNT(*) FILTER (WHERE rdo.status = 'aprovado')::int AS aprovado,
            COUNT(*) FILTER (WHERE rdo.status = 'cancelado')::int AS cancelado
          FROM rdos rdo
          WHERE rdo.company_id = $1
        `,
        params: [report.scope.companyId],
      },
    ];

    if (report.scope.siteId) {
      queryMatrix.push({
        name: 'dossier_site_recent',
        description:
          'Feed documental do dossie por obra/setor, ordenado por created_at.',
        sql: `
          SELECT rdo.id, rdo.numero, rdo.status, rdo.created_at
          FROM rdos rdo
          WHERE rdo.company_id = $1
            AND rdo.site_id = $2
          ORDER BY rdo.created_at DESC, rdo.id DESC
          LIMIT 25
        `,
        params: [report.scope.companyId, report.scope.siteId],
      });

      queryMatrix.push({
        name: 'pending_pdf_queue_by_site',
        description:
          'Pendencia documental do RDO por obra/setor, com foco em aprovados/enviados sem PDF.',
        sql: `
          SELECT rdo.id, rdo.company_id, rdo.site_id, rdo.numero, rdo.status, rdo.updated_at
          FROM rdos rdo
          WHERE rdo.company_id = $1
            AND rdo.site_id = $2
            AND rdo.status IN ('enviado', 'aprovado')
            AND rdo.pdf_file_key IS NULL
          ORDER BY rdo.updated_at DESC, rdo.id DESC
        `,
        params: [report.scope.companyId, report.scope.siteId],
      });
    }

    for (const queryInput of queryMatrix) {
      const explained = await explainQuery(client, queryInput);
      report.explainPlans.push(explained);
    }

    const rdoEstimatedRows = Number(report.tableStats?.estimated_rows || 0);
    if (rdoEstimatedRows < 1000) {
      report.warnings.push(
        `A tabela rdos esta com volume estimado muito baixo (${rdoEstimatedRows} linhas). O planner pode preferir Seq Scan mesmo com indices corretos.`,
      );
    }

    for (const plan of report.explainPlans) {
      if (plan.actualPlan.seqScans.includes('rdos')) {
        report.findings.push(
          `A query ${plan.name} executou Seq Scan em rdos no plano real; valide novamente em homolog/producao com maior cardinalidade.`,
        );
      }
      if (
        plan.forcedIndexPlan &&
        plan.forcedIndexPlan.indexes.length > 0 &&
        plan.actualPlan.indexes.length === 0
      ) {
        report.findings.push(
          `A query ${plan.name} nao usou indice no plano real, mas possui caminho indexado elegivel quando Seq Scan e desabilitado.`,
        );
      }
    }

    if (!report.pgStatStatements?.available) {
      report.findings.push(
        'pg_stat_statements indisponivel. Falta telemetria SQL consolidada para observar carga real do RDO.',
      );
    } else if ((report.pgStatStatements.topStatements || []).length === 0) {
      report.findings.push(
        'pg_stat_statements esta ativo, mas nao houve consultas suficientes do RDO para formar historico relevante nesta base.',
      );
    }

    report.status = 'pass';
  } catch (error) {
    report.status = 'fail';
    report.findings.push(error instanceof Error ? error.message : String(error));
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
  const report = await runAudit({
    companyId: typeof args['company-id'] === 'string' ? args['company-id'] : null,
    siteId: typeof args['site-id'] === 'string' ? args['site-id'] : null,
  });

  const outputDir = path.resolve(
    process.cwd(),
    typeof args['output-dir'] === 'string' ? args['output-dir'] : 'temp',
  );
  fs.mkdirSync(outputDir, { recursive: true });

  const reportPath = path.join(
    outputDir,
    `rdo-performance-audit-${createTimestampLabel(new Date())}.json`,
  );
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  if (args.json === true) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      JSON.stringify(
        {
          status: report.status,
          reportPath,
          scope: report.scope,
          findings: report.findings,
          warnings: report.warnings,
        },
        null,
        2,
      ),
    );
  }

  if (report.status !== 'pass') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
