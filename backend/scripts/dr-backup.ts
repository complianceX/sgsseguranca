import * as fs from 'fs/promises';
import * as path from 'path';
import { DocumentStorageService } from '../src/common/services/document-storage.service';
import { DisasterRecoveryExecutionService } from '../src/disaster-recovery/disaster-recovery-execution.service';
import {
  DISASTER_RECOVERY_DEFAULT_BACKUP_RETENTION_DAYS,
  DISASTER_RECOVERY_DEFAULT_BACKUP_ROOT,
  DISASTER_RECOVERY_DEFAULT_STORAGE_BACKUP_PREFIX,
} from '../src/disaster-recovery/disaster-recovery.constants';
import {
  buildBackupArtifactName,
  resolveDisasterRecoveryEnvironment,
  resolveRetentionDays,
} from '../src/disaster-recovery/disaster-recovery.util';
import {
  appendAuditLog,
  buildPgDumpArgs,
  checkCommandAvailable,
  computeFileSha256,
  ensureDir,
  getStringArg,
  hasFlag,
  parseCliArgs,
  resolveDatabaseRuntimeConfig,
  runWithSuperAdminContext,
  runCommand,
  statFile,
  withNestAppContext,
  writeJsonFile,
} from './disaster-recovery/common';

type BackupManifest = {
  version: 1;
  type: 'database_backup';
  backupName: string;
  environment: string;
  status: 'planned' | 'success' | 'failed' | 'dry_run';
  triggerSource: string;
  startedAt: string;
  completedAt: string | null;
  retentionDays: number;
  databaseTarget: string;
  artifact: {
    filePath: string;
    sha256: string | null;
    sizeBytes: number | null;
    format: 'pg_dump_custom';
  };
  storageReplication: {
    requested: boolean;
    uploaded: boolean;
    storageKey: string | null;
  };
  cleanup: {
    deletedPaths: string[];
  };
  notes: string[];
};

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const dryRun = hasFlag(args, 'dry-run');
  const uploadToStorage = hasFlag(args, 'upload-to-storage');
  const triggerSource = getStringArg(args, 'trigger-source') || 'manual';
  const requestedByUserId = getStringArg(args, 'requested-by-user-id');
  const environment = resolveDisasterRecoveryEnvironment(
    getStringArg(args, 'environment') || process.env.DR_ENVIRONMENT_NAME,
    process.env.NODE_ENV,
  );
  const retentionDays = resolveRetentionDays(
    getStringArg(args, 'retention-days') ||
      process.env.DR_BACKUP_RETENTION_DAYS ||
      DISASTER_RECOVERY_DEFAULT_BACKUP_RETENTION_DAYS,
  );
  const label = getStringArg(args, 'label');
  const backupRoot = path.resolve(
    process.cwd(),
    getStringArg(args, 'backup-root') ||
      process.env.DR_BACKUP_ROOT ||
      DISASTER_RECOVERY_DEFAULT_BACKUP_ROOT,
  );
  const backupName = buildBackupArtifactName({
    environment,
    label,
  });
  const backupDir = path.join(
    backupRoot,
    'backups',
    environment,
    'database',
    backupName,
  );
  const artifactPath = path.join(backupDir, `${backupName}.dump`);
  const manifestPath = path.join(backupDir, 'manifest.json');
  const auditPath = path.join(backupRoot, 'audit', 'database-backup.jsonl');

  let databaseConfig:
    | ReturnType<typeof resolveDatabaseRuntimeConfig>
    | {
        target: string;
      };
  try {
    databaseConfig = resolveDatabaseRuntimeConfig();
  } catch (error) {
    if (!dryRun) {
      throw error;
    }

    databaseConfig = {
      target: 'unresolved-database-target',
    };
  }
  const manifest: BackupManifest = {
    version: 1,
    type: 'database_backup',
    backupName,
    environment,
    status: dryRun ? 'dry_run' : 'planned',
    triggerSource,
    startedAt: new Date().toISOString(),
    completedAt: null,
    retentionDays,
    databaseTarget: databaseConfig.target,
    artifact: {
      filePath: artifactPath,
      sha256: null,
      sizeBytes: null,
      format: 'pg_dump_custom',
    },
    storageReplication: {
      requested: uploadToStorage,
      uploaded: false,
      storageKey: null,
    },
    cleanup: {
      deletedPaths: [],
    },
    notes: [],
  };
  const appContextOverrides = {
    REDIS_DISABLED: process.env.REDIS_DISABLED || 'true',
    API_CRONS_DISABLED: process.env.API_CRONS_DISABLED || 'true',
  };

  await appendAuditLog(auditPath, {
    event: 'dr_backup_started',
    status: manifest.status,
    operation: 'database_backup',
    timestamp: manifest.startedAt,
    metadata: {
      backupName,
      environment,
      triggerSource,
      retentionDays,
      dryRun,
      uploadToStorage,
    },
  });

  if (!dryRun && !checkCommandAvailable('pg_dump')) {
    throw new Error(
      'pg_dump não encontrado no PATH. Instale o cliente PostgreSQL ou execute o backup em um runner/container com pg_dump disponível.',
    );
  }

  await ensureDir(backupDir);

  let executionId: string | null = null;
  if (!dryRun) {
    await withNestAppContext(appContextOverrides, async (app) => {
      const executionService = app.get(DisasterRecoveryExecutionService);
      const execution = await runWithSuperAdminContext(app, async () =>
        executionService.startExecution({
          operationType: 'database_backup',
          scope: 'database',
          environment,
          triggerSource,
          requestedByUserId,
          backupName,
          artifactPath,
          metadata: {
            retentionDays,
            uploadToStorage,
            databaseTarget: databaseConfig.target,
          },
        }),
      );
      executionId = execution.id;
    });
  } else {
    manifest.notes.push(
      'Dry-run executado. Nenhum dump físico foi gerado e nenhuma escrita em banco foi realizada.',
    );
    if (databaseConfig.target === 'unresolved-database-target') {
      manifest.notes.push(
        'Configuração de banco não resolvida no ambiente local. O manifesto foi gerado mesmo assim para validação do fluxo de disaster recovery.',
      );
    }
  }

  try {
    if (!dryRun) {
      const dumpCommand = buildPgDumpArgs(
        databaseConfig as ReturnType<typeof resolveDatabaseRuntimeConfig>,
        artifactPath,
      );
      await runCommand({
        command: 'pg_dump',
        args: dumpCommand.args,
        env: dumpCommand.env,
        cwd: process.cwd(),
      });

      manifest.artifact.sha256 = await computeFileSha256(artifactPath);
      manifest.artifact.sizeBytes = await statFile(artifactPath);
      const deletedPaths = await cleanupExpiredBackups(
        path.join(backupRoot, 'backups', environment, 'database'),
        retentionDays,
        backupDir,
      );
      manifest.cleanup.deletedPaths = deletedPaths;

      if (uploadToStorage) {
        await withNestAppContext(appContextOverrides, async (app) => {
          const storageService = app.get(DocumentStorageService);
          const buffer = await fs.readFile(artifactPath);
          const storageKey = [
            process.env.DR_STORAGE_BACKUP_PREFIX ||
              DISASTER_RECOVERY_DEFAULT_STORAGE_BACKUP_PREFIX,
            environment,
            'database',
            backupName,
            path.basename(artifactPath),
          ].join('/');

          await storageService.uploadFile(
            storageKey,
            buffer,
            'application/octet-stream',
          );

          manifest.storageReplication.uploaded = true;
          manifest.storageReplication.storageKey = storageKey;
        });
      }

      manifest.status = 'success';
      manifest.notes.push(
        'Backup gerado em formato custom do pg_dump. Restore deve usar pg_restore com validação pós-restore.',
      );
    }
  } catch (error) {
    manifest.status = 'failed';
    manifest.notes.push(
      error instanceof Error ? error.message : 'Falha desconhecida no backup.',
    );
    if (executionId) {
      await withNestAppContext(appContextOverrides, async (app) => {
        const executionService = app.get(DisasterRecoveryExecutionService);
        await runWithSuperAdminContext(app, async () =>
          executionService.finalizeExecution(executionId!, {
            status: 'failed',
            backupName,
            artifactPath,
            artifactStorageKey: manifest.storageReplication.storageKey,
            errorMessage:
              error instanceof Error ? error.message : 'backup_failed',
            metadata: {
              retentionDays,
              uploadToStorage,
            },
          }),
        );
      });
    }

    manifest.completedAt = new Date().toISOString();
    await writeJsonFile(manifestPath, manifest);
    await appendAuditLog(auditPath, {
      event: 'dr_backup_failed',
      status: 'failed',
      operation: 'database_backup',
      timestamp: manifest.completedAt,
      metadata: {
        backupName,
        environment,
        errorMessage: error instanceof Error ? error.message : 'unknown',
      },
    });
    throw error;
  }

  manifest.completedAt = new Date().toISOString();
  await writeJsonFile(manifestPath, manifest);

  if (executionId) {
    await withNestAppContext(appContextOverrides, async (app) => {
      const executionService = app.get(DisasterRecoveryExecutionService);
      await runWithSuperAdminContext(app, async () =>
        executionService.finalizeExecution(executionId!, {
          status: 'success',
          backupName,
          artifactPath,
          artifactStorageKey: manifest.storageReplication.storageKey,
          metadata: {
            sha256: manifest.artifact.sha256,
            sizeBytes: manifest.artifact.sizeBytes,
            retentionDays,
            uploadToStorage,
            cleanupDeletedPaths: manifest.cleanup.deletedPaths,
          },
        }),
      );
    });
  }

  await appendAuditLog(auditPath, {
    event: 'dr_backup_completed',
    status: manifest.status,
    operation: 'database_backup',
    timestamp: manifest.completedAt,
    metadata: {
      backupName,
      environment,
      artifactPath,
      artifactStorageKey: manifest.storageReplication.storageKey,
      sha256: manifest.artifact.sha256,
      sizeBytes: manifest.artifact.sizeBytes,
      deletedPaths: manifest.cleanup.deletedPaths,
    },
  });

  console.log(
    JSON.stringify(
      {
        status: manifest.status,
        backupName,
        artifactPath,
        manifestPath,
        storageKey: manifest.storageReplication.storageKey,
      },
      null,
      2,
    ),
  );
}

async function cleanupExpiredBackups(
  backupBaseDir: string,
  retentionDays: number,
  currentBackupDir: string,
): Promise<string[]> {
  const deletedPaths: string[] = [];
  const threshold = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const entries = await fs.readdir(backupBaseDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const safeEntryName = path.basename(entry.name);
    if (safeEntryName !== entry.name) {
      continue;
    }
    const candidatePath = `${backupBaseDir}${path.sep}${safeEntryName}`;
    if (candidatePath === currentBackupDir) {
      continue;
    }

    const stats = await fs.stat(candidatePath);
    if (stats.mtimeMs >= threshold) {
      continue;
    }

    await fs.rm(candidatePath, { recursive: true, force: true });
    deletedPaths.push(candidatePath);
  }

  return deletedPaths;
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(
      '[DR][BACKUP] Falha:',
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  });
