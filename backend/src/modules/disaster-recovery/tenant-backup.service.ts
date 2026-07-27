import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { gzip, gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { captureException } from '../../shared/monitoring/sentry';
import { PrivilegedDbService } from '../../shared/database/privileged-db.service';
import { resolveSgsTempDirectory } from '../../shared/temp-directory.util';
import { DISASTER_RECOVERY_DEFAULT_BACKUP_ROOT } from './disaster-recovery.constants';
import { DisasterRecoveryExecutionService } from './disaster-recovery-execution.service';
import type {
  TenantBackupExecutionResult,
  TenantBackupListItem,
  TenantBackupPayload,
  TenantRestoreExecutionResult,
  TenantRestoreMode,
} from './tenant-backup.types';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const AES_256_GCM_IV_LENGTH_BYTES = 12;
const AES_256_GCM_AUTH_TAG_LENGTH_BYTES = 16;

type SchemaForeignKey = {
  table: string;
  column: string;
  referencedTable: string;
  referencedColumn: string;
};

type SchemaMetadata = {
  companyScopedTables: string[];
  primaryKeysByTable: Map<string, string[]>;
  foreignKeys: SchemaForeignKey[];
  columnsByTable: Map<string, Set<string>>;
  jsonColumnsByTable: Map<string, Set<string>>;
};

type TableRowsPayload = TenantBackupPayload['tables'][string];

type BackupReadQuery = <Row extends Record<string, unknown>>(
  sql: string,
  parameters?: unknown[],
) => Promise<Row[]>;

type RestoreQueryExecutor = {
  query: (sql: string, parameters?: unknown[]) => Promise<unknown>;
};

type CreateBackupOptions = {
  triggerSource: 'manual' | 'scheduled_daily';
  requestedByUserId?: string;
};

type RestoreFromBackupOptions = {
  sourceCompanyId: string;
  mode: TenantRestoreMode;
  targetCompanyId?: string;
  backupId?: string;
  backupFilePath?: string;
  requestedByUserId?: string;
  confirmCompanyId?: string;
  confirmPhrase?: string;
  targetCompanyName?: string;
  targetCompanyCnpj?: string;
};

type ResolveBackupFilePathInput = {
  sourceCompanyId: string;
  backupId?: string;
  backupFilePath?: string;
};

type TransformPayloadInput = {
  payload: TenantBackupPayload;
  mode: TenantRestoreMode;
  targetCompanyId: string;
  targetCompanyName?: string;
  targetCompanyCnpj?: string;
  schema: SchemaMetadata;
};

type RestoreExecutionInput = {
  mode: TenantRestoreMode;
  targetCompanyId: string;
  transformedPayload: TenantBackupPayload;
  schema: SchemaMetadata;
};

type EncryptionEnvelopeV1 = {
  v: 1;
  alg: 'aes-256-gcm';
  iv: string;
  tag: string;
  data: string;
};

const EXCLUDED_TABLES = new Set([
  'migrations',
  'disaster_recovery_executions',
  'refresh_tokens',
  'user_sessions',
  'typeorm_metadata',
]);

// Tabelas protegidas por trigger contra UPDATE/DELETE. No overwrite, os
// registros já existentes permanecem e os eventos ausentes do backup são
// inseridos de forma idempotente. Isso preserva a cadeia forense mais recente
// sem exigir session_replication_role=replica ou uma role SUPERUSER.
const APPEND_ONLY_TABLES = new Set(['forensic_trail_events']);

const EXCLUDED_COLUMNS_BY_TABLE = new Map<string, Set<string>>([
  [
    'users',
    new Set([
      'password',
      'signature_pin_hash',
      'signature_pin_salt',
      'refresh_token',
    ]),
  ],
]);

const TENANT_BACKUP_FILE_SUFFIX = '.json.gz';
const TENANT_BACKUP_META_SUFFIX = '.meta.json';
const TENANT_BACKUP_QUEUE_NAME = 'tenant-backup';
const RESTORE_CONFIRM_PREFIX = 'RESTORE';
const TENANT_BACKUP_ENCRYPTION_KEY_ENV = 'TENANT_BACKUP_ENCRYPTION_KEY';
const RESTORE_DANGEROUS_IN_PROD_ENV = 'DR_ALLOW_TENANT_OVERWRITE_IN_PRODUCTION';
const INSERT_BATCH_SIZE = 200;
const UUID_SEGMENT_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BACKUP_ID_SEGMENT_PATTERN = /^tenant-\d{8}-\d{6}-[0-9a-f]{8}$/i;

@Injectable()
export class TenantBackupService {
  private readonly logger = new Logger(TenantBackupService.name);
  private schemaMetadataCache: SchemaMetadata | null = null;

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly executionService: DisasterRecoveryExecutionService,
    private readonly privilegedDb: PrivilegedDbService,
  ) {}

  getQueueName(): string {
    return TENANT_BACKUP_QUEUE_NAME;
  }

  async backupTenant(
    companyId: string,
    options: CreateBackupOptions,
  ): Promise<TenantBackupExecutionResult> {
    const safeCompanyId = this.assertSafeUuidSegment(companyId, 'companyId');
    const backupId = this.generateBackupId();
    const backupRoot = this.getBackupRoot();
    const companyBackupDir = path.join(backupRoot, safeCompanyId);
    const backupFilePath = this.resolvePathInsideDirectory(
      companyBackupDir,
      `${backupId}${TENANT_BACKUP_FILE_SUFFIX}`,
    );
    const metadataFilePath = this.resolvePathInsideDirectory(
      companyBackupDir,
      `${backupId}${TENANT_BACKUP_META_SUFFIX}`,
    );

    await fs.mkdir(companyBackupDir, { recursive: true });

    const execution = await this.executionService.startExecution({
      operationType: 'database_backup',
      scope: 'database',
      environment: this.resolveEnvironment(),
      triggerSource: options.triggerSource,
      requestedByUserId: options.requestedByUserId ?? null,
      backupName: backupId,
      artifactPath: backupFilePath,
      metadata: {
        mode: 'tenant',
        companyId,
      },
    });

    try {
      const payload = await this.withTenantExportReadContext((query) =>
        this.buildTenantBackupPayload(companyId, backupId, query),
      );
      const serialized = Buffer.from(JSON.stringify(payload), 'utf8');
      const prepared = this.beforePersistBackup(serialized);
      const compressed = await gzipAsync(prepared);

      await fs.writeFile(backupFilePath, compressed);

      const listItem = await this.readBackupListItemFromPayload(
        payload,
        backupFilePath,
      );
      await fs.writeFile(
        metadataFilePath,
        JSON.stringify(listItem, null, 2),
        'utf8',
      );

      await this.executionService.finalizeExecution(execution.id, {
        status: 'success',
        backupName: backupId,
        artifactPath: backupFilePath,
        metadata: {
          mode: 'tenant',
          companyId,
          rowCounts: payload.rowCounts,
          checksumSha256: payload.checksumSha256,
          metadataPath: metadataFilePath,
        },
      });

      this.logger.log({
        event: 'tenant_backup_completed',
        executionId: execution.id,
        companyId,
        backupId,
        filePath: backupFilePath,
      });

      return {
        backupId,
        companyId,
        exportedAt: payload.exportedAt,
        filePath: backupFilePath,
        metadataPath: metadataFilePath,
        checksumSha256: payload.checksumSha256,
        rowCounts: payload.rowCounts,
        schemaVersion: payload.schema.version,
      };
    } catch (error) {
      captureException(error, {
        tags: { module: 'tenant-backup', companyId },
      });
      await this.executionService.finalizeExecution(execution.id, {
        status: 'failed',
        backupName: backupId,
        artifactPath: backupFilePath,
        errorMessage: error instanceof Error ? error.message : String(error),
        metadata: {
          mode: 'tenant',
          companyId,
        },
      });
      this.logger.error({
        event: 'tenant_backup_failed',
        executionId: execution.id,
        companyId,
        backupId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async listBackups(companyId: string): Promise<TenantBackupListItem[]> {
    const safeCompanyId = this.assertSafeUuidSegment(companyId, 'companyId');
    const backupRoot = this.getBackupRoot();
    const companyBackupDir = path.join(backupRoot, safeCompanyId);

    let entries: string[];
    try {
      entries = await fs.readdir(companyBackupDir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }

    const metadataFiles = entries
      .filter((entry) => entry.endsWith(TENANT_BACKUP_META_SUFFIX))
      .sort((a, b) => b.localeCompare(a));

    const listItems: TenantBackupListItem[] = [];

    for (const metadataFile of metadataFiles) {
      const metadataPath = this.resolvePathInsideDirectory(
        companyBackupDir,
        path.join(companyBackupDir, path.basename(metadataFile)),
      );
      try {
        const raw = await fs.readFile(metadataPath, 'utf8');
        const parsed = JSON.parse(raw) as TenantBackupListItem;
        listItems.push(parsed);
      } catch (error) {
        this.logger.warn({
          event: 'tenant_backup_metadata_read_failed',
          companyId,
          metadataPath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return listItems.sort((a, b) => b.exportedAt.localeCompare(a.exportedAt));
  }

  async restoreBackup(
    input: RestoreFromBackupOptions,
  ): Promise<TenantRestoreExecutionResult> {
    const backupSourcePath = await this.resolveBackupFilePath({
      sourceCompanyId: input.sourceCompanyId,
      backupId: input.backupId,
      backupFilePath: input.backupFilePath,
    });
    const execution = await this.executionService.startExecution({
      operationType: 'database_restore',
      scope: 'database',
      environment: this.resolveEnvironment(),
      triggerSource: 'manual',
      requestedByUserId: input.requestedByUserId ?? null,
      backupName: input.backupId ?? path.basename(backupSourcePath),
      artifactPath: backupSourcePath,
      metadata: {
        mode: 'tenant',
        sourceCompanyId: input.sourceCompanyId,
      },
    });

    try {
      const payload = await this.readAndValidateBackupPayload(backupSourcePath);
      if (payload.companyId !== input.sourceCompanyId) {
        throw new BadRequestException(
          'O backup informado não pertence ao tenant de origem solicitado.',
        );
      }

      const targetCompanyId =
        input.mode === 'overwrite_same_tenant'
          ? input.sourceCompanyId
          : (input.targetCompanyId ?? randomUUID());

      this.assertRestoreConfirmation({
        mode: input.mode,
        sourceCompanyId: input.sourceCompanyId,
        targetCompanyId,
        confirmCompanyId: input.confirmCompanyId,
        confirmPhrase: input.confirmPhrase,
      });

      const schema = await this.loadSchemaMetadata();
      const transformed = this.transformPayloadForRestore({
        payload,
        mode: input.mode,
        targetCompanyId,
        targetCompanyName: input.targetCompanyName,
        targetCompanyCnpj: input.targetCompanyCnpj,
        schema,
      });

      await this.executeTenantRestore({
        mode: input.mode,
        targetCompanyId,
        transformedPayload: transformed,
        schema,
      });

      const restoredRowsByTable: Record<string, number> = {};
      Object.entries(transformed.tables).forEach(([table, value]) => {
        restoredRowsByTable[table] = value.rows.length;
      });

      const result: TenantRestoreExecutionResult = {
        backupId: payload.backupId,
        sourceCompanyId: input.sourceCompanyId,
        targetCompanyId,
        mode: input.mode,
        restoredTables: Object.keys(transformed.tables),
        restoredRowsByTable,
      };

      await this.executionService.finalizeExecution(execution.id, {
        status: 'success',
        backupName: payload.backupId,
        artifactPath: backupSourcePath,
        metadata: {
          mode: 'tenant',
          sourceCompanyId: input.sourceCompanyId,
          targetCompanyId,
          restoreMode: input.mode,
          restoredRowsByTable,
        },
      });

      this.logger.log({
        event: 'tenant_restore_completed',
        executionId: execution.id,
        sourceCompanyId: input.sourceCompanyId,
        targetCompanyId,
        mode: input.mode,
      });

      return result;
    } catch (error) {
      captureException(error, {
        tags: {
          module: 'tenant-backup',
          sourceCompanyId: input.sourceCompanyId,
          restoreMode: input.mode,
        },
      });
      await this.executionService.finalizeExecution(execution.id, {
        status: 'failed',
        backupName: input.backupId ?? null,
        artifactPath: backupSourcePath,
        errorMessage: error instanceof Error ? error.message : String(error),
        metadata: {
          mode: 'tenant',
          sourceCompanyId: input.sourceCompanyId,
          restoreMode: input.mode,
        },
      });
      this.logger.error({
        event: 'tenant_restore_failed',
        executionId: execution.id,
        sourceCompanyId: input.sourceCompanyId,
        mode: input.mode,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      if (input.backupFilePath) {
        await this.safeRemoveUploadedFile(input.backupFilePath);
      }
    }
  }

  async backupAllActiveTenants(
    requestedByUserId?: string,
  ): Promise<{ queued: string[] }> {
    // companies tem RLS FORCE: a query precisa do mesmo contexto privilegiado
    // usado pela exportacao. Cada backupTenant abre seu proprio snapshot
    // consistente para todas as tabelas que compoem o payload.
    const rows = await this.withTenantExportReadContext((query) =>
      query<{ id?: string }>(
        `SELECT id FROM "companies" WHERE "status" = true AND "deleted_at" IS NULL`,
      ),
    );

    const ids = rows
      .map((row) => row.id)
      .filter((id: string | undefined): id is string => Boolean(id));

    // Trava de sanidade: zero empresas ativas é quase sempre sinal de que o
    // contexto RLS não foi injetado (companies tem RLS FORCE) — nunca deveria
    // acontecer em produção com clientes reais. Falhar alto em vez de
    // "terminar com sucesso" tendo processado nada.
    if (ids.length === 0) {
      const message =
        'backupAllActiveTenants não encontrou nenhuma empresa ativa. ' +
        'Suspeita de contexto RLS ausente (companies tem RLS FORCE) — ' +
        'abortando em vez de reportar sucesso vazio.';
      this.logger.error({ event: 'tenant_backup_zero_companies_found' });
      throw new Error(message);
    }

    for (const companyId of ids) {
      await this.backupTenant(companyId, {
        triggerSource: 'scheduled_daily',
        requestedByUserId,
      });
    }

    return { queued: ids };
  }

  private async withTenantExportReadContext<T>(
    operation: (query: BackupReadQuery) => Promise<T>,
  ): Promise<T> {
    if (this.privilegedDb.isEnabled()) {
      return this.privilegedDb.withPrivilegedClient(async (client) => {
        let transactionStarted = false;
        try {
          await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
          transactionStarted = true;
          await client.query("SET LOCAL app.is_super_admin = 'true'");

          const query: BackupReadQuery = async <
            Row extends Record<string, unknown>,
          >(
            sql: string,
            parameters?: unknown[],
          ): Promise<Row[]> => {
            const result = await client.query(sql, parameters);
            return result.rows as Row[];
          };

          const result = await operation(query);
          await client.query('COMMIT');
          transactionStarted = false;
          return result;
        } catch (error) {
          if (transactionStarted) {
            try {
              await client.query('ROLLBACK');
            } catch (rollbackError) {
              this.reportTenantExportCleanupFailure(
                'tenant_export_privileged_rollback_failed',
                rollbackError,
              );
            }
          }
          throw error;
        }
      });
    }

    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction('REPEATABLE READ');
      await queryRunner.query('SET TRANSACTION READ ONLY');
      await queryRunner.query("SET LOCAL app.is_super_admin = 'true'");

      const query: BackupReadQuery = async <
        Row extends Record<string, unknown>,
      >(
        sql: string,
        parameters?: unknown[],
      ): Promise<Row[]> => {
        const rows: unknown = await queryRunner.query(sql, parameters);
        return rows as Row[];
      };

      const result = await operation(query);
      await queryRunner.commitTransaction();
      return result;
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        try {
          await queryRunner.rollbackTransaction();
        } catch (rollbackError) {
          this.reportTenantExportCleanupFailure(
            'tenant_export_fallback_rollback_failed',
            rollbackError,
          );
        }
      }
      throw error;
    } finally {
      try {
        await queryRunner.release();
      } catch (releaseError) {
        this.reportTenantExportCleanupFailure(
          'tenant_export_query_runner_release_failed',
          releaseError,
        );
      }
    }
  }

  private reportTenantExportCleanupFailure(
    event: string,
    error: unknown,
  ): void {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn({ event, message });
    captureException(error, {
      tags: {
        module: 'disaster-recovery',
        operation: 'tenant-export-cleanup',
      },
      extra: { event },
    });
  }

  async pruneBackups(): Promise<{
    deletedFiles: number;
    retainedBackups: number;
    companies: number;
  }> {
    const backupRoot = this.getBackupRoot();
    await fs.mkdir(backupRoot, { recursive: true });

    const companyEntries = await fs.readdir(backupRoot, {
      withFileTypes: true,
    });
    const companyDirs = companyEntries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    let deletedFiles = 0;
    let retainedBackups = 0;

    for (const companyId of companyDirs) {
      const backups = await this.listBackups(companyId);
      if (backups.length === 0) {
        continue;
      }

      const sorted = [...backups].sort((a, b) =>
        b.exportedAt.localeCompare(a.exportedAt),
      );

      const keep = new Set<string>();
      sorted.slice(0, 30).forEach((item) => keep.add(item.backupId));

      const monthlyMonths = new Set<string>();
      for (const item of sorted) {
        const date = new Date(item.exportedAt);
        if (Number.isNaN(date.getTime()) || date.getUTCDate() !== 1) {
          continue;
        }

        const monthKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
        if (monthlyMonths.has(monthKey)) {
          continue;
        }

        keep.add(item.backupId);
        monthlyMonths.add(monthKey);
        if (monthlyMonths.size >= 12) {
          break;
        }
      }

      retainedBackups += keep.size;

      for (const item of sorted) {
        if (keep.has(item.backupId)) {
          continue;
        }

        const backupFilePath = item.filePath;
        const metadataFilePath = backupFilePath.replace(
          TENANT_BACKUP_FILE_SUFFIX,
          TENANT_BACKUP_META_SUFFIX,
        );

        deletedFiles += await this.safeDeleteFile(backupFilePath);
        deletedFiles += await this.safeDeleteFile(metadataFilePath);
      }
    }

    this.logger.log({
      event: 'tenant_backup_prune_completed',
      deletedFiles,
      retainedBackups,
      companies: companyDirs.length,
    });

    return {
      deletedFiles,
      retainedBackups,
      companies: companyDirs.length,
    };
  }

  private async buildTenantBackupPayload(
    companyId: string,
    backupId: string,
    query: BackupReadQuery,
  ): Promise<TenantBackupPayload> {
    const schema = await this.loadSchemaMetadata(query);
    const exportedAt = new Date().toISOString();
    const schemaVersion = await this.resolveSchemaVersion(query);

    const tables = new Map<string, TableRowsPayload>();

    const companyRows = await this.selectRowsByColumn(
      'companies',
      'id',
      [companyId],
      schema,
      query,
    );
    if (companyRows.length === 0) {
      throw new NotFoundException(`Empresa ${companyId} não encontrada.`);
    }
    tables.set('companies', {
      primaryKeyColumns: schema.primaryKeysByTable.get('companies') ?? ['id'],
      rowCount: companyRows.length,
      rows: companyRows,
    });

    for (const table of schema.companyScopedTables) {
      if (table === 'companies' || EXCLUDED_TABLES.has(table)) {
        continue;
      }

      const rows = await this.selectRowsByColumn(
        table,
        'company_id',
        [companyId],
        schema,
        query,
      );
      tables.set(table, {
        primaryKeyColumns: schema.primaryKeysByTable.get(table) ?? [],
        rowCount: rows.length,
        rows,
      });
    }

    await this.expandRelatedRowsByForeignKeys({
      tables,
      schema,
      query,
    });

    const rowCounts: Record<string, number> = {};
    const payloadTables: TenantBackupPayload['tables'] = {};

    for (const [table, payload] of tables.entries()) {
      rowCounts[table] = payload.rows.length;
      payloadTables[table] = {
        primaryKeyColumns: payload.primaryKeyColumns,
        rowCount: payload.rows.length,
        rows: payload.rows,
      };
    }

    const basePayload: Omit<TenantBackupPayload, 'checksumSha256'> = {
      version: 1,
      backupId,
      companyId,
      exportedAt,
      schema: {
        version: schemaVersion,
        exportedAt,
      },
      rowCounts,
      tables: payloadTables,
      notes: [
        'password/signature pin hashes e refresh/session tokens não são exportados.',
        'Backup por tenant preserva soft-deletes e histórico operacional.',
      ],
    };

    const checksumSha256 = this.computePayloadChecksum(basePayload);

    return {
      ...basePayload,
      checksumSha256,
    };
  }

  private async expandRelatedRowsByForeignKeys(input: {
    tables: Map<string, TableRowsPayload>;
    schema: SchemaMetadata;
    query: BackupReadQuery;
  }): Promise<void> {
    const queue = Array.from(input.tables.keys());
    const visited = new Set<string>();

    while (queue.length > 0) {
      const parentTable = queue.shift();
      if (!parentTable) {
        continue;
      }

      const parentPayload = input.tables.get(parentTable);
      if (!parentPayload || parentPayload.rows.length === 0) {
        continue;
      }

      const relations = input.schema.foreignKeys.filter(
        (fk) =>
          fk.referencedTable === parentTable &&
          !EXCLUDED_TABLES.has(fk.table) &&
          !input.schema.companyScopedTables.includes(fk.table),
      );

      for (const relation of relations) {
        const relationKey = `${relation.table}:${relation.column}:${relation.referencedTable}:${relation.referencedColumn}`;
        if (visited.has(relationKey)) {
          continue;
        }
        visited.add(relationKey);

        const referenceValues = parentPayload.rows
          .map((row) => row[relation.referencedColumn])
          .filter((value) => value !== null && value !== undefined)
          .map((value) => this.scalarString(value));

        if (referenceValues.length === 0) {
          continue;
        }

        const rows = await this.selectRowsByColumn(
          relation.table,
          relation.column,
          referenceValues,
          input.schema,
          input.query,
        );

        if (rows.length === 0) {
          continue;
        }

        const existing = input.tables.get(relation.table);
        const mergedRows = this.mergeRows({
          table: relation.table,
          currentRows: existing?.rows ?? [],
          incomingRows: rows,
          primaryKeyColumns:
            existing?.primaryKeyColumns ??
            input.schema.primaryKeysByTable.get(relation.table) ??
            [],
        });

        input.tables.set(relation.table, {
          primaryKeyColumns:
            existing?.primaryKeyColumns ??
            input.schema.primaryKeysByTable.get(relation.table) ??
            [],
          rowCount: mergedRows.length,
          rows: mergedRows,
        });

        queue.push(relation.table);
      }
    }
  }

  private mergeRows(input: {
    table: string;
    currentRows: Array<Record<string, unknown>>;
    incomingRows: Array<Record<string, unknown>>;
    primaryKeyColumns: string[];
  }): Array<Record<string, unknown>> {
    const map = new Map<string, Record<string, unknown>>();
    const makeKey = (row: Record<string, unknown>): string => {
      if (input.primaryKeyColumns.length === 0) {
        return this.stableStringify(row);
      }
      return input.primaryKeyColumns
        .map((column) => this.scalarString(row[column]))
        .join('#');
    };

    for (const row of input.currentRows) {
      map.set(makeKey(row), row);
    }
    for (const row of input.incomingRows) {
      map.set(makeKey(row), row);
    }

    return Array.from(map.values());
  }

  private async readBackupListItemFromPayload(
    payload: TenantBackupPayload,
    filePath: string,
  ): Promise<TenantBackupListItem> {
    const stats = await fs.stat(filePath);
    return {
      backupId: payload.backupId,
      companyId: payload.companyId,
      exportedAt: payload.exportedAt,
      checksumSha256: payload.checksumSha256,
      filePath,
      fileSizeBytes: stats.size,
      schemaVersion: payload.schema.version,
      rowCounts: payload.rowCounts,
    };
  }

  private async resolveBackupFilePath(
    input: ResolveBackupFilePathInput,
  ): Promise<string> {
    if (input.backupFilePath) {
      return this.resolveExistingUploadedBackupPath(input.backupFilePath);
    }

    if (!input.backupId) {
      throw new BadRequestException(
        'Informe backup_id ou arquivo de backup para restaurar.',
      );
    }

    const normalizedId = input.backupId.endsWith(TENANT_BACKUP_FILE_SUFFIX)
      ? input.backupId.slice(0, -TENANT_BACKUP_FILE_SUFFIX.length)
      : input.backupId;
    const safeBackupId = this.assertSafeBackupIdSegment(normalizedId);
    const safeCompanyId = this.assertSafeUuidSegment(
      input.sourceCompanyId,
      'sourceCompanyId',
    );
    const backupRoot = this.getBackupRoot();
    const companyBackupDir = path.join(backupRoot, safeCompanyId);

    const resolved = this.resolvePathInsideDirectory(
      companyBackupDir,
      path.join(
        companyBackupDir,
        `${safeBackupId}${TENANT_BACKUP_FILE_SUFFIX}`,
      ),
    );

    try {
      await fs.access(resolved);
      return resolved;
    } catch {
      throw new NotFoundException(
        `Backup ${input.backupId} não encontrado para o tenant ${input.sourceCompanyId}.`,
      );
    }
  }

  private async readAndValidateBackupPayload(
    backupFilePath: string,
  ): Promise<TenantBackupPayload> {
    // lgtm[js/path-injection]
    const compressed = await fs.readFile(backupFilePath);
    const uncompressed = await gunzipAsync(compressed);
    const plain = this.afterReadBackup(uncompressed);

    let payload: TenantBackupPayload;
    try {
      payload = JSON.parse(plain.toString('utf8')) as TenantBackupPayload;
    } catch {
      throw new BadRequestException(
        'Arquivo de backup inválido: JSON não pôde ser interpretado.',
      );
    }

    this.assertPayloadShape(payload);

    const { checksumSha256, ...checksumBase } = payload;
    const expectedChecksum = this.computePayloadChecksum(checksumBase);
    if (checksumSha256 !== expectedChecksum) {
      throw new BadRequestException(
        'Checksum do backup inválido. O arquivo pode estar corrompido ou adulterado.',
      );
    }

    return payload;
  }

  private assertPayloadShape(payload: TenantBackupPayload): void {
    if (
      !payload ||
      payload.version !== 1 ||
      typeof payload.backupId !== 'string' ||
      typeof payload.companyId !== 'string' ||
      typeof payload.exportedAt !== 'string' ||
      typeof payload.checksumSha256 !== 'string' ||
      typeof payload.tables !== 'object' ||
      payload.tables === null
    ) {
      throw new BadRequestException(
        'Arquivo de backup inválido: contrato de payload incompatível.',
      );
    }
  }

  private assertRestoreConfirmation(input: {
    mode: TenantRestoreMode;
    sourceCompanyId: string;
    targetCompanyId: string;
    confirmCompanyId?: string;
    confirmPhrase?: string;
  }): void {
    if (input.mode === 'clone_to_new_tenant') {
      if (input.targetCompanyId === input.sourceCompanyId) {
        throw new BadRequestException(
          'Clone para novo tenant requer targetCompanyId diferente do tenant de origem.',
        );
      }
      return;
    }

    if (this.resolveEnvironment() === 'production') {
      const allowDangerous =
        /^true$/i.test(
          this.configService.get<string>(RESTORE_DANGEROUS_IN_PROD_ENV) ?? '',
        ) === true;
      if (!allowDangerous) {
        throw new BadRequestException(
          `Restore destrutivo em produção bloqueado por padrão. Defina ${RESTORE_DANGEROUS_IN_PROD_ENV}=true para habilitar explicitamente.`,
        );
      }
    }

    if (input.confirmCompanyId !== input.targetCompanyId) {
      throw new BadRequestException(
        'Confirmação inválida: confirm_company_id deve coincidir com o tenant alvo.',
      );
    }

    const expectedPhrase = this.buildRestoreConfirmPhrase(
      input.targetCompanyId,
    );
    if (input.confirmPhrase !== expectedPhrase) {
      throw new BadRequestException(
        `Confirmação inválida: use exatamente "${expectedPhrase}".`,
      );
    }
  }

  private transformPayloadForRestore(
    input: TransformPayloadInput,
  ): TenantBackupPayload {
    const transformedTables: TenantBackupPayload['tables'] = {};

    for (const [table, tablePayload] of Object.entries(input.payload.tables)) {
      if (
        !input.schema.columnsByTable.has(table) ||
        EXCLUDED_TABLES.has(table)
      ) {
        continue;
      }

      const rows = tablePayload.rows.map((rawRow) => {
        const row = this.decodeSerializedRow(rawRow);
        const columns = input.schema.columnsByTable.get(table) ?? new Set();

        if (input.mode === 'clone_to_new_tenant') {
          if (columns.has('company_id')) {
            row.company_id = input.targetCompanyId;
          }

          if (table === 'companies') {
            row.id = input.targetCompanyId;
            if (input.targetCompanyName) {
              row.razao_social = input.targetCompanyName;
            }
            if (input.targetCompanyCnpj) {
              row.cnpj = input.targetCompanyCnpj;
            }
            if (columns.has('updated_at')) {
              row.updated_at = new Date().toISOString();
            }
            if (columns.has('created_at') && !row.created_at) {
              row.created_at = new Date().toISOString();
            }
          }
        } else if (columns.has('company_id')) {
          row.company_id = input.targetCompanyId;
        }

        return row;
      });

      transformedTables[table] = {
        primaryKeyColumns: [...tablePayload.primaryKeyColumns],
        rowCount: rows.length,
        rows,
      };
    }

    const basePayload: Omit<TenantBackupPayload, 'checksumSha256'> = {
      ...input.payload,
      companyId: input.targetCompanyId,
      exportedAt: new Date().toISOString(),
      tables: transformedTables,
      rowCounts: Object.fromEntries(
        Object.entries(transformedTables).map(([table, value]) => [
          table,
          value.rows.length,
        ]),
      ),
      notes: [
        ...input.payload.notes,
        `restore_mode=${input.mode}`,
        `target_company_id=${input.targetCompanyId}`,
      ],
    };

    return {
      ...basePayload,
      checksumSha256: this.computePayloadChecksum(basePayload),
    };
  }

  private async executeTenantRestore(
    input: RestoreExecutionInput,
  ): Promise<void> {
    if (this.privilegedDb.isEnabled()) {
      await this.privilegedDb.withPrivilegedClient(async (client) => {
        let transactionStarted = false;
        try {
          await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
          transactionStarted = true;
          await client.query("SET LOCAL app.is_super_admin = 'true'");

          const executor: RestoreQueryExecutor = {
            query: async (sql, parameters) => {
              const result = await client.query(sql, parameters);
              return result.rows as unknown[];
            },
          };
          await this.executeTenantRestoreInTransaction(executor, input);
          await client.query('COMMIT');
          transactionStarted = false;
        } catch (error) {
          if (transactionStarted) {
            try {
              await client.query('ROLLBACK');
            } catch (rollbackError) {
              this.reportTenantExportCleanupFailure(
                'tenant_restore_privileged_rollback_failed',
                rollbackError,
              );
            }
          }
          throw error;
        }
      });
      return;
    }

    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction('SERIALIZABLE');
      await this.executeTenantRestoreInTransaction(queryRunner, input);
      await queryRunner.commitTransaction();
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        try {
          await queryRunner.rollbackTransaction();
        } catch (rollbackError) {
          this.reportTenantExportCleanupFailure(
            'tenant_restore_fallback_rollback_failed',
            rollbackError,
          );
        }
      }
      throw error;
    } finally {
      try {
        await queryRunner.release();
      } catch (releaseError) {
        this.reportTenantExportCleanupFailure(
          'tenant_restore_query_runner_release_failed',
          releaseError,
        );
      }
    }
  }

  private async executeTenantRestoreInTransaction(
    executor: RestoreQueryExecutor,
    input: RestoreExecutionInput,
  ): Promise<void> {
    await executor.query(`SET LOCAL lock_timeout = '5s'`);
    await executor.query(`SET LOCAL statement_timeout = '0'`);

    const tables = Object.keys(input.transformedPayload.tables);
    const companiesPayload = input.transformedPayload.tables['companies'];
    if (!companiesPayload || companiesPayload.rows.length === 0) {
      throw new BadRequestException(
        'Backup inválido: tabela companies ausente ou sem registros.',
      );
    }

    if (input.mode === 'clone_to_new_tenant') {
      await this.assertTargetCompanyDoesNotExist(
        executor,
        input.targetCompanyId,
      );
    } else {
      await this.cleanupTargetCompanyData({
        queryRunner: executor,
        targetCompanyId: input.targetCompanyId,
        payload: input.transformedPayload,
        schema: input.schema,
      });
    }

    await this.upsertCompanyRow(
      executor,
      companiesPayload.rows[0],
      input.mode,
      input.targetCompanyId,
      input.schema,
    );

    const insertionOrder = this.resolveInsertionOrder(
      input.schema,
      tables,
    ).filter((table) => table !== 'companies');
    for (const table of insertionOrder) {
      const tablePayload = input.transformedPayload.tables[table];
      if (!tablePayload || tablePayload.rows.length === 0) {
        continue;
      }
      await this.insertRows(executor, table, tablePayload.rows, input.schema);
    }
  }

  private async cleanupTargetCompanyData(input: {
    queryRunner: RestoreQueryExecutor;
    targetCompanyId: string;
    payload: TenantBackupPayload;
    schema: SchemaMetadata;
  }): Promise<void> {
    const targetExists = await this.companyExists(
      input.queryRunner,
      input.targetCompanyId,
    );
    if (!targetExists) {
      throw new NotFoundException(
        `Tenant alvo ${input.targetCompanyId} não existe para restore em sobrescrita.`,
      );
    }

    const tables = Object.keys(input.payload.tables);
    const deletionOrder = this.resolveInsertionOrder(input.schema, tables)
      .reverse()
      .filter((table) => table !== 'companies');

    for (const table of deletionOrder) {
      if (APPEND_ONLY_TABLES.has(table)) {
        continue;
      }
      const columns = input.schema.columnsByTable.get(table) ?? new Set();
      if (columns.has('company_id')) {
        await input.queryRunner.query(
          `DELETE FROM ${this.quoteIdentifier(table)} WHERE ${this.quoteIdentifier('company_id')} = $1`,
          [input.targetCompanyId],
        );
        continue;
      }

      const tablePayload = input.payload.tables[table];
      const primaryKeyColumns =
        tablePayload?.primaryKeyColumns ??
        input.schema.primaryKeysByTable.get(table) ??
        [];
      if (
        !tablePayload ||
        tablePayload.rows.length === 0 ||
        primaryKeyColumns.length === 0
      ) {
        continue;
      }

      await this.deleteRowsByPrimaryKeys(
        input.queryRunner,
        table,
        primaryKeyColumns,
        tablePayload.rows,
      );
    }
  }

  private async deleteRowsByPrimaryKeys(
    queryRunner: RestoreQueryExecutor,
    table: string,
    primaryKeyColumns: string[],
    rows: Array<Record<string, unknown>>,
  ): Promise<void> {
    if (rows.length === 0 || primaryKeyColumns.length === 0) {
      return;
    }

    if (primaryKeyColumns.length === 1) {
      const column = primaryKeyColumns[0];
      const ids = rows
        .map((row) => row[column])
        .filter((value) => value !== null && value !== undefined)
        .map((value) => this.scalarString(value));
      if (ids.length === 0) {
        return;
      }
      await queryRunner.query(
        `DELETE FROM ${this.quoteIdentifier(table)} WHERE CAST(${this.quoteIdentifier(column)} AS text) = ANY($1::text[])`,
        [ids],
      );
      return;
    }

    for (const chunkRows of this.chunk(rows, INSERT_BATCH_SIZE)) {
      const conditions: string[] = [];
      const params: unknown[] = [];
      for (const row of chunkRows) {
        const andConditions: string[] = [];
        for (const column of primaryKeyColumns) {
          params.push(row[column]);
          andConditions.push(
            `${this.quoteIdentifier(column)} = $${params.length}`,
          );
        }
        conditions.push(`(${andConditions.join(' AND ')})`);
      }
      if (conditions.length === 0) {
        continue;
      }
      await queryRunner.query(
        `DELETE FROM ${this.quoteIdentifier(table)} WHERE ${conditions.join(' OR ')}`,
        params,
      );
    }
  }

  private async upsertCompanyRow(
    queryRunner: RestoreQueryExecutor,
    row: Record<string, unknown>,
    mode: TenantRestoreMode,
    targetCompanyId: string,
    schema: SchemaMetadata,
  ): Promise<void> {
    const columns = Object.keys(row);
    if (columns.length === 0) {
      throw new BadRequestException(
        'Backup inválido: registro de companies vazio.',
      );
    }
    if (row.id !== targetCompanyId) {
      row.id = targetCompanyId;
    }

    const existing = await this.companyExists(queryRunner, targetCompanyId);
    if (!existing) {
      await this.insertRows(queryRunner, 'companies', [row], schema);
      return;
    }

    const updatableColumns = columns.filter((column) => column !== 'id');
    if (updatableColumns.length === 0) {
      return;
    }

    const assignments = updatableColumns.map(
      (column, index) => `${this.quoteIdentifier(column)} = $${index + 1}`,
    );
    const values = updatableColumns.map((column) =>
      this.prepareColumnValue('companies', column, row[column], schema),
    );
    values.push(targetCompanyId);

    await queryRunner.query(
      `UPDATE ${this.quoteIdentifier('companies')}
       SET ${assignments.join(', ')}
       WHERE ${this.quoteIdentifier('id')} = $${values.length}`,
      values,
    );

    if (mode === 'clone_to_new_tenant') {
      throw new BadRequestException(
        `Clone bloqueado: o tenant alvo ${targetCompanyId} já existe.`,
      );
    }
  }

  private async companyExists(
    queryRunner: RestoreQueryExecutor,
    companyId: string,
  ): Promise<boolean> {
    const rows = (await queryRunner.query(
      `SELECT 1 FROM ${this.quoteIdentifier('companies')} WHERE ${this.quoteIdentifier('id')} = $1 LIMIT 1`,
      [companyId],
    )) as unknown[];
    return rows.length > 0;
  }

  private async assertTargetCompanyDoesNotExist(
    queryRunner: RestoreQueryExecutor,
    targetCompanyId: string,
  ): Promise<void> {
    const exists = await this.companyExists(queryRunner, targetCompanyId);
    if (exists) {
      throw new BadRequestException(
        `Tenant alvo ${targetCompanyId} já existe. Informe outro target_company_id para clone.`,
      );
    }
  }

  private resolveInsertionOrder(
    schema: SchemaMetadata,
    tables: string[],
  ): string[] {
    const nodes = new Set(
      tables.filter(
        (table) =>
          schema.columnsByTable.has(table) && !EXCLUDED_TABLES.has(table),
      ),
    );
    const dependencies = new Map<string, Set<string>>();
    const dependents = new Map<string, Set<string>>();
    nodes.forEach((node) => {
      dependencies.set(node, new Set());
      dependents.set(node, new Set());
    });

    for (const fk of schema.foreignKeys) {
      if (!nodes.has(fk.table) || !nodes.has(fk.referencedTable)) {
        continue;
      }
      // Uma FK autorreferente (ex.: aprs.parent_apr_id -> aprs.id) não cria
      // dependência entre tabelas. Mantê-la no grafo impede o nó de chegar a
      // grau zero e joga todo o subgrafo para o fallback alfabético, quebrando
      // a ordem reversa de exclusão (users podia ser removida antes de aprs).
      if (fk.table === fk.referencedTable) {
        continue;
      }
      dependencies.get(fk.table)?.add(fk.referencedTable);
      dependents.get(fk.referencedTable)?.add(fk.table);
    }

    const queue = Array.from(nodes).filter(
      (node) => (dependencies.get(node)?.size ?? 0) === 0,
    );
    const ordered: string[] = [];

    while (queue.length > 0) {
      const node = queue.shift() as string;
      ordered.push(node);
      for (const dependent of dependents.get(node) ?? []) {
        const dependencySet = dependencies.get(dependent);
        if (!dependencySet) {
          continue;
        }
        dependencySet.delete(node);
        if (dependencySet.size === 0) {
          queue.push(dependent);
        }
      }
    }

    if (ordered.length < nodes.size) {
      const unresolved = Array.from(nodes).filter(
        (node) => !ordered.includes(node),
      );
      unresolved.sort((a, b) => a.localeCompare(b));
      ordered.push(...unresolved);
    }

    return ordered;
  }

  private async insertRows(
    queryRunner: RestoreQueryExecutor,
    table: string,
    rows: Array<Record<string, unknown>>,
    schema: SchemaMetadata,
  ): Promise<void> {
    if (rows.length === 0) {
      return;
    }

    const allowedColumns = schema.columnsByTable.get(table);
    if (!allowedColumns || allowedColumns.size === 0) {
      throw new BadRequestException(
        `Tabela ${table} não está disponível no schema atual para restore.`,
      );
    }

    const excludedColumns = EXCLUDED_COLUMNS_BY_TABLE.get(table) ?? new Set();
    const columns = Array.from(
      rows.reduce((accumulator, row) => {
        Object.keys(row).forEach((column) => {
          if (
            allowedColumns.has(column) &&
            !excludedColumns.has(column) &&
            row[column] !== undefined
          ) {
            accumulator.add(column);
          }
        });
        return accumulator;
      }, new Set<string>()),
    );

    if (columns.length === 0) {
      return;
    }

    for (const chunkRows of this.chunk(rows, INSERT_BATCH_SIZE)) {
      const valuesSql: string[] = [];
      const params: unknown[] = [];

      for (const row of chunkRows) {
        const placeholders: string[] = [];
        for (const column of columns) {
          params.push(
            this.prepareColumnValue(table, column, row[column], schema),
          );
          placeholders.push(`$${params.length}`);
        }
        valuesSql.push(`(${placeholders.join(', ')})`);
      }

      const conflictClause = APPEND_ONLY_TABLES.has(table)
        ? ' ON CONFLICT DO NOTHING'
        : '';
      const sql = `INSERT INTO ${this.quoteIdentifier(table)} (${columns
        .map((column) => this.quoteIdentifier(column))
        .join(', ')}) VALUES ${valuesSql.join(', ')}${conflictClause}`;

      await queryRunner.query(sql, params);
    }
  }

  private async loadSchemaMetadata(
    query?: BackupReadQuery,
  ): Promise<SchemaMetadata> {
    if (this.schemaMetadataCache) {
      return this.schemaMetadataCache;
    }

    const read = query ?? this.createDataSourceReadQuery();
    const columnRows = await read<{
      table_name: string;
      column_name: string;
      data_type: string;
    }>(
      `
        SELECT
          cols.table_name,
          cols.column_name,
          cols.data_type
        FROM information_schema.columns cols
        JOIN pg_namespace ns
          ON ns.nspname = cols.table_schema
        JOIN pg_class rel
          ON rel.relnamespace = ns.oid
         AND rel.relname = cols.table_name
        WHERE cols.table_schema = 'public'
          AND rel.relkind IN ('r', 'p')
          AND NOT rel.relispartition
      `,
    );

    const columnsByTable = new Map<string, Set<string>>();
    const jsonColumnsByTable = new Map<string, Set<string>>();
    for (const row of columnRows) {
      if (!columnsByTable.has(row.table_name)) {
        columnsByTable.set(row.table_name, new Set());
      }
      columnsByTable.get(row.table_name)?.add(row.column_name);

      if (row.data_type === 'json' || row.data_type === 'jsonb') {
        if (!jsonColumnsByTable.has(row.table_name)) {
          jsonColumnsByTable.set(row.table_name, new Set());
        }
        jsonColumnsByTable.get(row.table_name)?.add(row.column_name);
      }
    }

    const companyScopedTables = Array.from(columnsByTable.entries())
      .filter(
        ([table, columns]) =>
          table === 'companies' || columns.has('company_id'),
      )
      .map(([table]) => table)
      .filter((table) => !EXCLUDED_TABLES.has(table))
      .sort((a, b) => a.localeCompare(b));

    const primaryKeyRows = await read<{
      table_name: string;
      column_name: string;
    }>(
      `
        SELECT
          tc.table_name,
          kcu.column_name,
          kcu.ordinal_position
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = 'public'
          AND tc.constraint_type = 'PRIMARY KEY'
        ORDER BY tc.table_name, kcu.ordinal_position
      `,
    );

    const primaryKeysByTable = new Map<string, string[]>();
    for (const row of primaryKeyRows) {
      const current = primaryKeysByTable.get(row.table_name) ?? [];
      current.push(row.column_name);
      primaryKeysByTable.set(row.table_name, current);
    }

    const foreignKeyRows = await read<{
      table_name: string;
      column_name: string;
      referenced_table_name: string;
      referenced_column_name: string;
    }>(
      `
        SELECT
          child.relname AS table_name,
          child_attribute.attname AS column_name,
          parent.relname AS referenced_table_name,
          parent_attribute.attname AS referenced_column_name
        FROM pg_constraint constraint_row
        JOIN pg_class child
          ON child.oid = constraint_row.conrelid
        JOIN pg_namespace child_namespace
          ON child_namespace.oid = child.relnamespace
        JOIN pg_class parent
          ON parent.oid = constraint_row.confrelid
        JOIN LATERAL unnest(constraint_row.conkey)
          WITH ORDINALITY child_key(attnum, ordinality)
          ON true
        JOIN LATERAL unnest(constraint_row.confkey)
          WITH ORDINALITY parent_key(attnum, ordinality)
          ON parent_key.ordinality = child_key.ordinality
        JOIN pg_attribute child_attribute
          ON child_attribute.attrelid = child.oid
         AND child_attribute.attnum = child_key.attnum
        JOIN pg_attribute parent_attribute
          ON parent_attribute.attrelid = parent.oid
         AND parent_attribute.attnum = parent_key.attnum
        WHERE constraint_row.contype = 'f'
          AND child_namespace.nspname = 'public'
          AND NOT child.relispartition
          AND NOT parent.relispartition
      `,
    );

    const foreignKeys: SchemaForeignKey[] = foreignKeyRows.map((row) => ({
      table: row.table_name,
      column: row.column_name,
      referencedTable: row.referenced_table_name,
      referencedColumn: row.referenced_column_name,
    }));

    this.schemaMetadataCache = {
      companyScopedTables,
      primaryKeysByTable,
      foreignKeys,
      columnsByTable,
      jsonColumnsByTable,
    };

    return this.schemaMetadataCache;
  }

  private createDataSourceReadQuery(): BackupReadQuery {
    return async <Row extends Record<string, unknown>>(
      sql: string,
      parameters?: unknown[],
    ): Promise<Row[]> => {
      const rows: unknown = await this.dataSource.query(sql, parameters);
      return rows as Row[];
    };
  }

  private async resolveSchemaVersion(
    query: BackupReadQuery,
  ): Promise<string | null> {
    try {
      const migrationTableLookup = await query<{
        migration_table?: unknown;
      }>(`SELECT to_regclass('public.migrations') AS migration_table`);
      const migrationTable = migrationTableLookup[0]?.migration_table;
      if (typeof migrationTable !== 'string' || migrationTable.length === 0) {
        return null;
      }

      const rows = await query<{ name?: unknown }>(
        `SELECT name FROM "migrations" ORDER BY "timestamp" DESC LIMIT 1`,
      );
      const name = rows[0]?.name;
      return typeof name === 'string' ? name : null;
    } catch {
      return null;
    }
  }

  private async selectRowsByColumn(
    table: string,
    column: string,
    values: string[],
    schema: SchemaMetadata,
    query: BackupReadQuery,
  ): Promise<Array<Record<string, unknown>>> {
    if (values.length === 0) {
      return [];
    }

    const sql = `SELECT * FROM ${this.quoteIdentifier(table)} WHERE CAST(${this.quoteIdentifier(column)} AS text) = ANY($1::text[])`;
    const rows = await query<Record<string, unknown>>(sql, [values]);
    return rows.map((row) => this.sanitizeRowForExport(table, row, schema));
  }

  private sanitizeRowForExport(
    table: string,
    row: Record<string, unknown>,
    schema: SchemaMetadata,
  ): Record<string, unknown> {
    const allowedColumns =
      schema.columnsByTable.get(table) ?? new Set<string>();
    const excludedColumns =
      EXCLUDED_COLUMNS_BY_TABLE.get(table) ?? new Set<string>();

    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (!allowedColumns.has(key) || excludedColumns.has(key)) {
        continue;
      }
      sanitized[key] = this.encodeSerializableValue(value);
    }
    return sanitized;
  }

  private encodeSerializableValue(value: unknown): unknown {
    if (value === null || value === undefined) {
      return value;
    }
    if (Buffer.isBuffer(value)) {
      return {
        __gstType: 'buffer',
        base64: value.toString('base64'),
      };
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === 'bigint') {
      return value.toString();
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.encodeSerializableValue(item));
    }
    if (typeof value === 'object') {
      const output: Record<string, unknown> = {};
      for (const [key, nestedValue] of Object.entries(
        value as Record<string, unknown>,
      )) {
        output[key] = this.encodeSerializableValue(nestedValue);
      }
      return output;
    }
    return value;
  }

  private decodeSerializedRow(
    row: Record<string, unknown>,
  ): Record<string, unknown> {
    const decoded: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      decoded[key] = this.decodeSerializedValue(value);
    }
    return decoded;
  }

  private decodeSerializedValue(value: unknown): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.decodeSerializedValue(item));
    }

    if (typeof value === 'object') {
      const candidate = value as Record<string, unknown>;
      if (
        candidate.__gstType === 'buffer' &&
        typeof candidate.base64 === 'string'
      ) {
        return Buffer.from(candidate.base64, 'base64');
      }

      const output: Record<string, unknown> = {};
      for (const [key, nestedValue] of Object.entries(candidate)) {
        output[key] = this.decodeSerializedValue(nestedValue);
      }
      return output;
    }

    return value;
  }

  private prepareColumnValue(
    table: string,
    column: string,
    rawValue: unknown,
    schema: SchemaMetadata,
  ): unknown {
    const decoded = this.decodeSerializedValue(rawValue);
    const jsonColumns = schema.jsonColumnsByTable.get(table);

    if (decoded === null || decoded === undefined) {
      return decoded;
    }

    if (jsonColumns?.has(column)) {
      return JSON.stringify(decoded);
    }

    return decoded;
  }

  private computePayloadChecksum(
    payload: Omit<TenantBackupPayload, 'checksumSha256'>,
  ): string {
    const stable = this.stableStringify(payload);
    return createHash('sha256').update(stable).digest('hex');
  }

  private stableStringify(value: unknown): string {
    if (value === null || value === undefined) {
      return 'null';
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return JSON.stringify(value);
    }

    if (typeof value === 'string') {
      return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    }

    if (typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>).sort(
        ([left], [right]) => left.localeCompare(right),
      );
      return `{${entries
        .map(
          ([key, nestedValue]) =>
            `${JSON.stringify(key)}:${this.stableStringify(nestedValue)}`,
        )
        .join(',')}}`;
    }

    if (typeof value === 'bigint') {
      return JSON.stringify(value.toString());
    }
    if (typeof value === 'symbol') {
      return JSON.stringify(value.description ?? 'symbol');
    }
    if (typeof value === 'function') {
      return JSON.stringify('[function]');
    }
    return JSON.stringify(null);
  }

  private beforePersistBackup(buffer: Buffer): Buffer {
    const key = this.resolveBackupEncryptionKey();
    if (!key) {
      if (this.configService.get<string>('NODE_ENV') === 'production') {
        throw new ServiceUnavailableException(
          `${TENANT_BACKUP_ENCRYPTION_KEY_ENV} é obrigatória para gerar backups de tenant em produção.`,
        );
      }
      return buffer;
    }

    const iv = randomBytes(AES_256_GCM_IV_LENGTH_BYTES);
    const cipher = createCipheriv('aes-256-gcm', key, iv, {
      authTagLength: AES_256_GCM_AUTH_TAG_LENGTH_BYTES,
    });
    const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
    const tag = cipher.getAuthTag();

    const envelope: EncryptionEnvelopeV1 = {
      v: 1,
      alg: 'aes-256-gcm',
      iv: iv.toString('base64url'),
      tag: tag.toString('base64url'),
      data: encrypted.toString('base64url'),
    };

    return Buffer.from(JSON.stringify(envelope), 'utf8');
  }

  private afterReadBackup(buffer: Buffer): Buffer {
    const parsed = this.tryParseEncryptionEnvelope(buffer);
    if (!parsed) {
      return buffer;
    }

    const key = this.resolveBackupEncryptionKey();
    if (!key) {
      throw new BadRequestException(
        `Backup criptografado, mas ${TENANT_BACKUP_ENCRYPTION_KEY_ENV} não foi configurada.`,
      );
    }

    const iv = Buffer.from(parsed.iv, 'base64url');
    const tag = Buffer.from(parsed.tag, 'base64url');
    const encrypted = Buffer.from(parsed.data, 'base64url');

    if (iv.length !== AES_256_GCM_IV_LENGTH_BYTES) {
      throw new BadRequestException('Backup criptografado com IV inválido.');
    }
    if (tag.length !== AES_256_GCM_AUTH_TAG_LENGTH_BYTES) {
      throw new BadRequestException(
        'Backup criptografado com tag de autenticação inválida.',
      );
    }

    const decipher = createDecipheriv('aes-256-gcm', key, iv, {
      authTagLength: AES_256_GCM_AUTH_TAG_LENGTH_BYTES,
    });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }

  private tryParseEncryptionEnvelope(
    buffer: Buffer,
  ): EncryptionEnvelopeV1 | null {
    try {
      const decoded = JSON.parse(
        buffer.toString('utf8'),
      ) as Partial<EncryptionEnvelopeV1>;
      if (
        decoded?.v === 1 &&
        decoded.alg === 'aes-256-gcm' &&
        typeof decoded.iv === 'string' &&
        typeof decoded.tag === 'string' &&
        typeof decoded.data === 'string'
      ) {
        return decoded as EncryptionEnvelopeV1;
      }
      return null;
    } catch {
      return null;
    }
  }

  private resolveBackupEncryptionKey(): Buffer | null {
    const raw =
      this.configService
        .get<string>(TENANT_BACKUP_ENCRYPTION_KEY_ENV)
        ?.trim() ?? '';
    if (!raw) {
      return null;
    }

    let parsed: Buffer;
    if (raw.startsWith('base64:')) {
      parsed = Buffer.from(raw.slice('base64:'.length), 'base64');
    } else if (raw.startsWith('hex:')) {
      parsed = Buffer.from(raw.slice('hex:'.length), 'hex');
    } else if (/^[a-f0-9]{64}$/i.test(raw)) {
      parsed = Buffer.from(raw, 'hex');
    } else {
      parsed = createHash('sha256').update(raw).digest();
    }

    if (parsed.length !== 32) {
      throw new BadRequestException(
        `${TENANT_BACKUP_ENCRYPTION_KEY_ENV} deve resolver para 32 bytes (AES-256).`,
      );
    }

    return parsed;
  }

  private buildRestoreConfirmPhrase(companyId: string): string {
    return `${RESTORE_CONFIRM_PREFIX} ${companyId}`;
  }

  private generateBackupId(): string {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    const h = String(now.getUTCHours()).padStart(2, '0');
    const min = String(now.getUTCMinutes()).padStart(2, '0');
    const s = String(now.getUTCSeconds()).padStart(2, '0');
    return `tenant-${y}${m}${d}-${h}${min}${s}-${randomUUID().slice(0, 8)}`;
  }

  private getBackupRoot(): string {
    const configured = this.configService.get<string>('TENANT_BACKUP_ROOT');
    if (configured && configured.trim().length > 0) {
      return path.resolve(configured.trim());
    }
    return path.resolve(
      `${DISASTER_RECOVERY_DEFAULT_BACKUP_ROOT}/tenant-backups`,
    );
  }

  private assertSafeUuidSegment(value: string, fieldName: string): string {
    const normalized = String(value || '').trim();
    if (!UUID_SEGMENT_PATTERN.test(normalized)) {
      throw new BadRequestException(`${fieldName} inválido.`);
    }
    return normalized;
  }

  private assertSafeBackupIdSegment(value: string): string {
    const normalized = String(value || '').trim();
    if (!BACKUP_ID_SEGMENT_PATTERN.test(normalized)) {
      throw new BadRequestException('backup_id inválido.');
    }
    return normalized;
  }

  private resolvePathInsideDirectory(
    baseDirectory: string,
    candidatePath: string,
  ): string {
    const resolvedBase = path.resolve(baseDirectory);
    const resolvedCandidate = path.isAbsolute(candidatePath)
      ? path.resolve(candidatePath)
      : path.resolve(resolvedBase, candidatePath);
    const relativePath = path.relative(resolvedBase, resolvedCandidate);
    const isInside =
      relativePath.length === 0 ||
      (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));

    if (!isInside) {
      throw new BadRequestException('Caminho de backup inválido.');
    }

    return resolvedCandidate;
  }

  private resolveExistingUploadedBackupPath(filePath: string): string {
    const uploadRoot = resolveSgsTempDirectory();
    return this.resolvePathInsideDirectory(uploadRoot, filePath);
  }

  private resolveEnvironment(): string {
    const env =
      this.configService.get<string>('DR_ENVIRONMENT_NAME') ??
      this.configService.get<string>('NODE_ENV') ??
      'development';
    return env.trim().length > 0 ? env : 'development';
  }

  private quoteIdentifier(identifier: string): string {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
      throw new BadRequestException(
        `Identificador SQL inválido: ${identifier}`,
      );
    }
    return `"${identifier}"`;
  }

  private scalarString(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'string') {
      return value;
    }
    if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return value.toString();
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (Buffer.isBuffer(value)) {
      return value.toString('base64');
    }
    return this.stableStringify(value);
  }

  private chunk<T>(value: T[], size: number): T[][] {
    if (value.length === 0) {
      return [];
    }
    const output: T[][] = [];
    for (let index = 0; index < value.length; index += size) {
      output.push(value.slice(index, index + size));
    }
    return output;
  }

  private async safeDeleteFile(filePath: string): Promise<number> {
    try {
      // lgtm[js/path-injection]
      await fs.unlink(
        this.resolvePathInsideDirectory(this.getBackupRoot(), filePath),
      );
      return 1;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return 0;
      }
      this.logger.warn({
        event: 'tenant_backup_prune_delete_failed',
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  private async safeRemoveUploadedFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(this.resolveExistingUploadedBackupPath(filePath));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }
      this.logger.warn({
        event: 'tenant_backup_uploaded_file_cleanup_failed',
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
