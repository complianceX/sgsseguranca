import * as fs from 'fs/promises';
import * as path from 'path';
import { DisasterRecoveryExecutionService } from '../src/disaster-recovery/disaster-recovery-execution.service';
import type { DisasterRecoveryIntegrityScanReport } from '../src/disaster-recovery/disaster-recovery.types';
import { DISASTER_RECOVERY_DEFAULT_BACKUP_ROOT } from '../src/disaster-recovery/disaster-recovery.constants';
import {
  assertSafeSeparateEnvironmentRecovery,
  resolveDisasterRecoveryEnvironment,
  resolveRuntimeNodeEnvironment,
} from '../src/disaster-recovery/disaster-recovery.util';
import {
  appendAuditLog,
  getStringArg,
  hasFlag,
  parseCliArgs,
  resolveReplicaStorageRuntimeConfig,
  runWithSuperAdminContext,
  runCommand,
  withNestAppContext,
  writeJsonFile,
} from './disaster-recovery/common';

type DatabaseRestoreManifest = {
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

type RecoveryValidationReport = {
  version: 1;
  type: 'environment_recovery_validation';
  sourceManifestPath: string;
  sourceBackupPath: string;
  backupName: string | null;
  sourceEnvironment: string;
  targetEnvironment: string;
  targetNodeEnv: 'development' | 'production' | 'test' | 'staging';
  execute: boolean;
  storageMode: 'replica' | 'primary';
  status: 'planned' | 'dry_run' | 'success' | 'failed' | 'partial';
  startedAt: string;
  completedAt: string | null;
  restoreReportPath: string;
  integrityReportPath: string;
  storage: {
    bucketName: string | null;
    endpoint: string | null;
    configured: boolean;
  };
  postRestore: {
    sqlValidation: DatabaseRestoreManifest['postRestore']['sqlValidation'];
    integritySummary: DisasterRecoveryIntegrityScanReport['summary'] | null;
  };
  notes: string[];
};

function buildStorageRuntime(input: {
  storageMode: 'replica' | 'primary';
  baseEnv: NodeJS.ProcessEnv;
}): {
  configured: boolean;
  bucketName: string | null;
  endpoint: string | null;
  env: NodeJS.ProcessEnv;
} {
  if (input.storageMode === 'replica') {
    const replica = resolveReplicaStorageRuntimeConfig(input.baseEnv);
    return {
      configured: replica.configured,
      bucketName: replica.bucketName,
      endpoint: replica.endpoint,
      env: replica.envOverrides,
    };
  }

  const bucketName =
    input.baseEnv.AWS_BUCKET_NAME || input.baseEnv.AWS_S3_BUCKET || null;
  const endpoint =
    input.baseEnv.AWS_ENDPOINT || input.baseEnv.AWS_S3_ENDPOINT || null;

  return {
    configured: Boolean(bucketName),
    bucketName,
    endpoint,
    env: { ...input.baseEnv },
  };
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const execute = hasFlag(args, 'execute');
  const dryRun = !execute || hasFlag(args, 'dry-run');
  const triggerSource = getStringArg(args, 'trigger-source') || 'manual';
  const requestedByUserId = getStringArg(args, 'requested-by-user-id');
  const manifestPath = path.resolve(
    process.cwd(),
    getStringArg(args, 'backup-manifest') || '',
  );
  const explicitBackupPath = getStringArg(args, 'backup-file');
  const targetDatabaseUrl =
    getStringArg(args, 'target-db-url') || process.env.DR_TARGET_DATABASE_URL;
  const storageMode =
    getStringArg(args, 'storage-mode') === 'primary' ? 'primary' : 'replica';
  const allowSameEnvironment = hasFlag(args, 'allow-same-environment');
  const targetEnvironment = resolveDisasterRecoveryEnvironment(
    getStringArg(args, 'target-environment') ||
      process.env.DR_TARGET_ENVIRONMENT ||
      'recovery',
    process.env.NODE_ENV,
  );
  const targetNodeEnv = resolveRuntimeNodeEnvironment(
    targetEnvironment,
    process.env.NODE_ENV,
  );
  const outputPath = path.resolve(
    process.cwd(),
    getStringArg(args, 'output') ||
      path.join(
        process.env.DR_BACKUP_ROOT || DISASTER_RECOVERY_DEFAULT_BACKUP_ROOT,
        'reports',
        targetEnvironment,
        `environment-recovery-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
      ),
  );
  const restoreReportPath = outputPath.replace(/\.json$/i, '.restore.json');
  const integrityReportPath = outputPath.replace(/\.json$/i, '.integrity.json');
  const auditPath = path.resolve(
    process.cwd(),
    process.env.DR_BACKUP_ROOT || DISASTER_RECOVERY_DEFAULT_BACKUP_ROOT,
    'audit',
    'environment-recovery-validation.jsonl',
  );

  if (!manifestPath) {
    throw new Error(
      'Informe --backup-manifest=/caminho/para/manifest.json para validar o recovery em ambiente separado.',
    );
  }

  const backupManifest = JSON.parse(
    await fs.readFile(manifestPath, 'utf8'),
  ) as {
    backupName?: string;
    artifact?: { filePath?: string | null };
    environment?: string;
  };
  const sourceEnvironment = resolveDisasterRecoveryEnvironment(
    getStringArg(args, 'source-environment') || backupManifest.environment,
    process.env.NODE_ENV,
  );
  const sourceBackupPath = path.resolve(
    process.cwd(),
    explicitBackupPath || backupManifest.artifact?.filePath || '',
  );

  assertSafeSeparateEnvironmentRecovery({
    execute: execute && !dryRun,
    sourceEnvironment,
    targetEnvironment,
    allowSameEnvironment,
  });

  const storageRuntime = buildStorageRuntime({
    storageMode,
    baseEnv: process.env,
  });

  if (execute && !dryRun && !targetDatabaseUrl) {
    throw new Error(
      'Informe --target-db-url ou DR_TARGET_DATABASE_URL para recovery real em ambiente separado.',
    );
  }

  if (execute && !dryRun && !storageRuntime.configured) {
    throw new Error(
      storageMode === 'replica'
        ? 'Storage de réplica não configurado. Defina DR_STORAGE_REPLICA_BUCKET e credenciais compatíveis para validar o recovery usando bucket secundário.'
        : 'Storage primário não configurado. Defina AWS_BUCKET_NAME/AWS_S3_BUCKET para validar o recovery com artefatos governados.',
    );
  }

  const report: RecoveryValidationReport = {
    version: 1,
    type: 'environment_recovery_validation',
    sourceManifestPath: manifestPath,
    sourceBackupPath,
    backupName:
      typeof backupManifest.backupName === 'string'
        ? backupManifest.backupName
        : null,
    sourceEnvironment,
    targetEnvironment,
    targetNodeEnv,
    execute: execute && !dryRun,
    storageMode,
    status: dryRun ? 'dry_run' : 'planned',
    startedAt: new Date().toISOString(),
    completedAt: null,
    restoreReportPath,
    integrityReportPath,
    storage: {
      bucketName: storageRuntime.bucketName,
      endpoint: storageRuntime.endpoint,
      configured: storageRuntime.configured,
    },
    postRestore: {
      sqlValidation: null,
      integritySummary: null,
    },
    notes: [],
  };

  await appendAuditLog(auditPath, {
    event: 'dr_environment_recovery_started',
    status: report.status,
    operation: 'environment_recovery_validation',
    timestamp: report.startedAt,
    metadata: {
      sourceManifestPath: manifestPath,
      sourceEnvironment,
      targetEnvironment,
      storageMode,
      execute: report.execute,
    },
  });

  if (dryRun) {
    report.notes.push(
      'Dry-run executado. Nenhum restore foi aplicado ao banco alvo e nenhum scanner real foi disparado.',
    );
    report.notes.push(
      storageRuntime.configured
        ? 'O storage selecionado está configurado para o recovery. A execução real apontará o scanner pós-restore para esse destino.'
        : 'O storage selecionado ainda não está configurado. Ajuste as variáveis antes do recovery real.',
    );
    report.completedAt = new Date().toISOString();
    await writeJsonFile(outputPath, report);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const sharedRecoveryEnv: NodeJS.ProcessEnv = {
    ...storageRuntime.env,
    DATABASE_URL: targetDatabaseUrl!,
    REDIS_DISABLED: 'true',
    API_CRONS_DISABLED: 'true',
    NODE_ENV: targetNodeEnv,
    DR_ENVIRONMENT_NAME: targetEnvironment,
  };

  try {
    await runCommand({
      command: 'node',
      args: [
        '-r',
        'ts-node/register/transpile-only',
        'scripts/dr-restore.ts',
        '--execute',
        '--skip-post-restore-scan',
        `--backup-manifest=${manifestPath}`,
        `--target-db-url=${targetDatabaseUrl!}`,
        `--target-environment=${targetEnvironment}`,
        `--output=${restoreReportPath}`,
        `--trigger-source=${triggerSource}`,
        ...(requestedByUserId
          ? [`--requested-by-user-id=${requestedByUserId}`]
          : []),
      ],
      env: sharedRecoveryEnv,
      cwd: process.cwd(),
    });

    await runCommand({
      command: 'node',
      args: [
        '-r',
        'ts-node/register/transpile-only',
        'scripts/dr-integrity-scan.ts',
        '--include-orphans',
        '--verify-hashes',
        `--output=${integrityReportPath}`,
      ],
      env: sharedRecoveryEnv,
      cwd: process.cwd(),
    });

    const restoreReport = JSON.parse(
      await fs.readFile(restoreReportPath, 'utf8'),
    ) as DatabaseRestoreManifest;
    const integrityReport = JSON.parse(
      await fs.readFile(integrityReportPath, 'utf8'),
    ) as DisasterRecoveryIntegrityScanReport;

    report.postRestore.sqlValidation = restoreReport.postRestore.sqlValidation;
    report.postRestore.integritySummary = integrityReport.summary;
    report.status =
      integrityReport.summary.criticalIssues > 0 ||
      integrityReport.summary.highIssues > 0
        ? 'partial'
        : 'success';

    await withNestAppContext(sharedRecoveryEnv, async (app) => {
      const executionService = app.get(DisasterRecoveryExecutionService);
      const executionStatus =
        report.status === 'success' || report.status === 'partial'
          ? report.status
          : 'failed';
      const execution = await runWithSuperAdminContext(app, async () =>
        executionService.startExecution({
          operationType: 'environment_recovery_validation',
          scope: 'system',
          environment: sourceEnvironment,
          targetEnvironment,
          triggerSource,
          requestedByUserId,
          backupName: report.backupName,
          artifactPath: outputPath,
          metadata: {
            sourceManifestPath: manifestPath,
            sourceBackupPath,
            storageMode,
            storageBucket: report.storage.bucketName,
            storageEndpoint: report.storage.endpoint,
          },
        }),
      );

      await runWithSuperAdminContext(app, async () =>
        executionService.finalizeExecution(execution.id, {
          status: executionStatus,
          backupName: report.backupName,
          artifactPath: outputPath,
          metadata: {
            restoreReportPath,
            integrityReportPath,
            sqlValidation: report.postRestore.sqlValidation,
            integritySummary: integrityReport.summary,
          },
        }),
      );
    });
  } catch (error) {
    report.status = 'failed';
    report.notes.push(
      error instanceof Error
        ? error.message
        : 'Falha desconhecida durante o recovery validation.',
    );
    report.completedAt = new Date().toISOString();
    await writeJsonFile(outputPath, report);
    await appendAuditLog(auditPath, {
      event: 'dr_environment_recovery_failed',
      status: 'failed',
      operation: 'environment_recovery_validation',
      timestamp: report.completedAt,
      metadata: {
        sourceManifestPath: manifestPath,
        targetEnvironment,
        storageMode,
        errorMessage:
          error instanceof Error
            ? error.message
            : 'environment_recovery_failed',
      },
    });
    throw error;
  }

  report.completedAt = new Date().toISOString();
  await writeJsonFile(outputPath, report);
  await appendAuditLog(auditPath, {
    event: 'dr_environment_recovery_completed',
    status: report.status,
    operation: 'environment_recovery_validation',
    timestamp: report.completedAt,
    metadata: {
      sourceManifestPath: manifestPath,
      sourceEnvironment,
      targetEnvironment,
      storageMode,
      restoreReportPath,
      integrityReportPath,
      integritySummary: report.postRestore.integritySummary,
    },
  });

  console.log(JSON.stringify(report, null, 2));
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(
      '[DR][RECOVERY] Falha:',
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  });
