import * as fs from 'fs/promises';
import * as path from 'path';
import { Client } from 'pg';
import { DisasterRecoveryExecutionService } from '../src/disaster-recovery/disaster-recovery-execution.service';
import {
  resolveDisasterRecoveryEnvironment,
  resolveRuntimeNodeEnvironment,
} from '../src/disaster-recovery/disaster-recovery.util';
import {
  appendAuditLog,
  buildPgRestoreArgs,
  checkCommandAvailable,
  getStringArg,
  hasFlag,
  parseCliArgs,
  runWithSuperAdminContext,
  runCommand,
  withNestAppContext,
  writeJsonFile,
} from './disaster-recovery/common';
import { assertSafeRestoreExecution } from '../src/disaster-recovery/disaster-recovery.util';

type RestoreManifest = {
  version: 1;
  type: 'database_restore';
  sourceManifestPath: string;
  sourceBackupPath: string;
  environment: string;
  targetEnvironment: string;
  execute: boolean;
  status: 'planned' | 'dry_run' | 'success' | 'failed' | 'partial';
  startedAt: string;
  completedAt: string | null;
  postRestore: {
    sqlValidation: {
      tablesCount: number | null;
      registryCount: number | null;
      companyCount: number | null;
    } | null;
    integrityScanReportPath: string | null;
  };
  notes: string[];
};

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const execute = hasFlag(args, 'execute');
  const dryRun = !execute || hasFlag(args, 'dry-run');
  const manifestPath = path.resolve(
    process.cwd(),
    getStringArg(args, 'backup-manifest') || '',
  );
  const explicitBackupPath = getStringArg(args, 'backup-file');
  const triggerSource = getStringArg(args, 'trigger-source') || 'manual';
  const requestedByUserId = getStringArg(args, 'requested-by-user-id');
  const targetDatabaseUrl =
    getStringArg(args, 'target-db-url') || process.env.DR_TARGET_DATABASE_URL;
  const targetEnvironment = resolveDisasterRecoveryEnvironment(
    getStringArg(args, 'target-environment') ||
      process.env.DR_TARGET_ENVIRONMENT ||
      process.env.NODE_ENV,
    process.env.NODE_ENV,
  );
  const targetNodeEnv = resolveRuntimeNodeEnvironment(
    targetEnvironment,
    process.env.NODE_ENV,
  );
  const confirmationToken =
    getStringArg(args, 'confirmation-token') ||
    process.env.DR_RESTORE_CONFIRMATION_TOKEN;
  const allowProductionRestore =
    hasFlag(args, 'allow-production-restore') ||
    /^true$/i.test(process.env.DR_ALLOW_PRODUCTION_RESTORE || '');
  const skipPostRestoreScan = hasFlag(args, 'skip-post-restore-scan');
  const outputPath = path.resolve(
    process.cwd(),
    getStringArg(args, 'output') ||
      path.join(
        'output',
        'disaster-recovery',
        'reports',
        targetEnvironment,
        `restore-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
      ),
  );
  const auditPath = path.resolve(
    process.cwd(),
    'output',
    'disaster-recovery',
    'audit',
    'database-restore.jsonl',
  );

  if (!manifestPath) {
    throw new Error(
      'Informe --backup-manifest=/caminho/para/manifest.json para restaurar o backup.',
    );
  }

  if (!targetDatabaseUrl && execute) {
    throw new Error(
      'Informe --target-db-url ou DR_TARGET_DATABASE_URL para restore real.',
    );
  }

  assertSafeRestoreExecution({
    execute: execute && !dryRun,
    targetEnvironment,
    allowProductionRestore,
    confirmationToken,
  });

  const backupManifest = JSON.parse(
    await fs.readFile(manifestPath, 'utf8'),
  ) as {
    backupName?: string;
    artifact?: { filePath?: string | null };
    environment?: string;
  };

  const sourceBackupPath = path.resolve(
    process.cwd(),
    explicitBackupPath || backupManifest.artifact?.filePath || '',
  );
  const restoreManifest: RestoreManifest = {
    version: 1,
    type: 'database_restore',
    sourceManifestPath: manifestPath,
    sourceBackupPath,
    environment:
      typeof backupManifest.environment === 'string'
        ? backupManifest.environment
        : 'unknown',
    targetEnvironment,
    execute: execute && !dryRun,
    status: dryRun ? 'dry_run' : 'planned',
    startedAt: new Date().toISOString(),
    completedAt: null,
    postRestore: {
      sqlValidation: null,
      integrityScanReportPath: null,
    },
    notes: [],
  };

  await appendAuditLog(auditPath, {
    event: 'dr_restore_started',
    status: restoreManifest.status,
    operation: 'database_restore',
    timestamp: restoreManifest.startedAt,
    metadata: {
      sourceManifestPath: manifestPath,
      sourceBackupPath,
      targetEnvironment,
      execute: restoreManifest.execute,
      skipPostRestoreScan,
    },
  });

  if (dryRun) {
    restoreManifest.notes.push(
      'Dry-run executado. Nenhuma restauração foi aplicada ao banco-alvo.',
    );
    restoreManifest.notes.push(
      'Para restore real use --execute, informe target-db-url e confirme produção explicitamente quando aplicável.',
    );
    restoreManifest.completedAt = new Date().toISOString();
    await writeJsonFile(outputPath, restoreManifest);
    console.log(JSON.stringify(restoreManifest, null, 2));
    return;
  }

  if (!checkCommandAvailable('pg_restore')) {
    throw new Error(
      'pg_restore não encontrado no PATH. Instale o cliente PostgreSQL antes de restaurar.',
    );
  }

  const restoreCommand = buildPgRestoreArgs(
    sourceBackupPath,
    targetDatabaseUrl!,
  );

  try {
    await runCommand({
      command: 'pg_restore',
      args: restoreCommand.args,
      env: restoreCommand.env,
      cwd: process.cwd(),
    });

    restoreManifest.postRestore.sqlValidation =
      await runPostRestoreSqlValidation(targetDatabaseUrl!);

    if (!skipPostRestoreScan) {
      const integrityReportPath = outputPath.replace(
        /\.json$/i,
        '.integrity.json',
      );
      restoreManifest.postRestore.integrityScanReportPath = integrityReportPath;

      await runCommand({
        command: 'node',
        args: [
          '-r',
          'ts-node/register/transpile-only',
          'scripts/dr-integrity-scan.ts',
          `--output=${integrityReportPath}`,
          '--include-orphans',
        ],
        env: {
          ...process.env,
          DATABASE_URL: targetDatabaseUrl!,
          REDIS_DISABLED: 'true',
          API_CRONS_DISABLED: process.env.API_CRONS_DISABLED || 'true',
          NODE_ENV: targetNodeEnv,
          DR_ENVIRONMENT_NAME: targetEnvironment,
        },
        cwd: process.cwd(),
      });
    } else {
      restoreManifest.notes.push(
        'Validação pós-restore via integrity scan foi ignorada por configuração explícita.',
      );
    }

    await withNestAppContext(
      {
        DATABASE_URL: targetDatabaseUrl!,
        REDIS_DISABLED: 'true',
        API_CRONS_DISABLED: process.env.API_CRONS_DISABLED || 'true',
        NODE_ENV: targetNodeEnv,
        DR_ENVIRONMENT_NAME: targetEnvironment,
      },
      async (app) => {
        const executionService = app.get(DisasterRecoveryExecutionService);
        const execution = await runWithSuperAdminContext(app, async () =>
          executionService.startExecution({
            operationType: 'database_restore',
            scope: 'database',
            environment: restoreManifest.environment,
            targetEnvironment,
            triggerSource,
            requestedByUserId,
            backupName: backupManifest.backupName || null,
            artifactPath: outputPath,
            metadata: {
              sourceManifestPath: manifestPath,
              sourceBackupPath,
            },
          }),
        );

        await runWithSuperAdminContext(app, async () =>
          executionService.finalizeExecution(execution.id, {
            status: 'success',
            backupName: backupManifest.backupName || null,
            artifactPath: outputPath,
            metadata: {
              sqlValidation: restoreManifest.postRestore.sqlValidation,
              integrityScanReportPath:
                restoreManifest.postRestore.integrityScanReportPath,
            },
          }),
        );
      },
    );

    restoreManifest.status = 'success';
  } catch (error) {
    restoreManifest.status = 'failed';
    restoreManifest.notes.push(
      error instanceof Error ? error.message : 'Falha desconhecida no restore.',
    );
    restoreManifest.completedAt = new Date().toISOString();
    await writeJsonFile(outputPath, restoreManifest);
    await appendAuditLog(auditPath, {
      event: 'dr_restore_failed',
      status: 'failed',
      operation: 'database_restore',
      timestamp: restoreManifest.completedAt,
      metadata: {
        sourceManifestPath: manifestPath,
        targetEnvironment,
        errorMessage: error instanceof Error ? error.message : 'unknown',
      },
    });
    throw error;
  }

  restoreManifest.completedAt = new Date().toISOString();
  await writeJsonFile(outputPath, restoreManifest);
  await appendAuditLog(auditPath, {
    event: 'dr_restore_completed',
    status: restoreManifest.status,
    operation: 'database_restore',
    timestamp: restoreManifest.completedAt,
    metadata: {
      sourceManifestPath: manifestPath,
      targetEnvironment,
      sqlValidation: restoreManifest.postRestore.sqlValidation,
      integrityScanReportPath:
        restoreManifest.postRestore.integrityScanReportPath,
    },
  });

  console.log(JSON.stringify(restoreManifest, null, 2));
}

async function runPostRestoreSqlValidation(targetDatabaseUrl: string) {
  const client = new Client({
    connectionString: targetDatabaseUrl,
    ssl:
      /^true$/i.test(process.env.DATABASE_SSL || '') ||
      /^true$/i.test(process.env.DATABASE_SSL_ALLOW_INSECURE || '')
        ? { rejectUnauthorized: false }
        : undefined,
  });

  await client.connect();
  try {
    const tables = await client.query<{
      count: string;
    }>(
      `SELECT COUNT(*)::text AS count
         FROM information_schema.tables
        WHERE table_schema = 'public'`,
    );
    const registry = await client.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM document_registry',
    );
    const companies = await client.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM companies',
    );

    return {
      tablesCount: Number(tables.rows[0]?.count ?? 0),
      registryCount: Number(registry.rows[0]?.count ?? 0),
      companyCount: Number(companies.rows[0]?.count ?? 0),
    };
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(
    '[DR][RESTORE] Falha:',
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
