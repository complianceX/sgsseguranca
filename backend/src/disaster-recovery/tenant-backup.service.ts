import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, QueryRunner } from 'typeorm';
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
import { captureException } from '../common/monitoring/sentry';
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

@Injectable()
export class TenantBackupService {
  private readonly logger = new Logger(TenantBackupService.name);
  private schemaMetadataCache: SchemaMetadata | null = null;

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly executionService: DisasterRecoveryExecutionService,
  ) {}

  getQueueName(): string {
    return TENANT_BACKUP_QUEUE_NAME;
  }

  async backupTenant(
    companyId: string,
    options: CreateBackupOptions,
  ): Promise<TenantBackupExecutionResult> {
    const backupId = this.generateBackupId();
    const backupRoot = this.getBackupRoot();
    const companyBackupDir = path.join(backupRoot, companyId);
    const backupFilePath = path.join(
      companyBackupDir,
      `${backupId}${TENANT_BACKUP_FILE_SUFFIX}`,
    );
    const metadataFilePath = path.join(
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
      const payload = await this.buildTenantBackupPayload(companyId, backupId);
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
    const companyBackupDir = path.join(this.getBackupRoot(), companyId);

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
      const metadataPath = path.join(companyBackupDir, metadataFile);
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
    const rows = (await this.dataSource.query(
      `SELECT id FROM "companies" WHERE "status" = true AND "deleted_at" IS NULL`,
    )) as unknown as Array<{ id?: string }>;
    const ids = rows
      .map((row) => row.id)
      .filter((id: string | undefined): id is string => Boolean(id));

    for (const companyId of ids) {
      await this.backupTenant(companyId, {
        triggerSource: 'scheduled_daily',
        requestedByUserId,
      });
    }

    return { queued: ids };
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
  ): Promise<TenantBackupPayload> {
    const schema = await this.loadSchemaMetadata();
    const exportedAt = new Date().toISOString();
    const schemaVersion = await this.resolveSchemaVersion();

    const tables = new Map<string, TableRowsPayload>();

    const companyRows = await this.selectRowsByColumn(
      'companies',
      'id',
      [companyId],
      schema,
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
      return path.resolve(input.backupFilePath);
    }

    if (!input.backupId) {
      throw new BadRequestException(
        'Informe backup_id ou arquivo de backup para restaurar.',
      );
    }

    const normalizedId = input.backupId.endsWith(TENANT_BACKUP_FILE_SUFFIX)
      ? input.backupId.slice(0, -TENANT_BACKUP_FILE_SUFFIX.length)
      : input.backupId;

    const resolved = path.join(
      this.getBackupRoot(),
      input.sourceCompanyId,
      `${normalizedId}${TENANT_BACKUP_FILE_SUFFIX}`,
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
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('SERIALIZABLE');

    try {
      await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);
      await queryRunner.query(`SET LOCAL statement_timeout = '0'`);
      await queryRunner.query(`SET LOCAL session_replication_role = replica`);

      const tables = Object.keys(input.transformedPayload.tables);
      const companiesPayload = input.transformedPayload.tables['companies'];
      if (!companiesPayload || companiesPayload.rows.length === 0) {
        throw new BadRequestException(
          'Backup inválido: tabela companies ausente ou sem registros.',
        );
      }

      if (input.mode === 'clone_to_new_tenant') {
        await this.assertTargetCompanyDoesNotExist(
          queryRunner,
          input.targetCompanyId,
        );
      } else {
        await this.cleanupTargetCompanyData({
          queryRunner,
          targetCompanyId: input.targetCompanyId,
          payload: input.transformedPayload,
          schema: input.schema,
        });
      }

      await this.upsertCompanyRow(
        queryRunner,
        companiesPayload.rows[0],
        input.mode,
        input.targetCompanyId,
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
        await this.insertRows(
          queryRunner,
          table,
          tablePayload.rows,
          input.schema,
        );
      }

      await queryRunner.query(`SET LOCAL session_replication_role = DEFAULT`);
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async cleanupTargetCompanyData(input: {
    queryRunner: QueryRunner;
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
    queryRunner: QueryRunner,
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
    queryRunner: QueryRunner,
    row: Record<string, unknown>,
    mode: TenantRestoreMode,
    targetCompanyId: string,
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
      await this.insertRows(
        queryRunner,
        'companies',
        [row],
        await this.loadSchemaMetadata(),
      );
      return;
    }

    const updatableColumns = columns.filter((column) => column !== 'id');
    if (updatableColumns.length === 0) {
      return;
    }

    const assignments = updatableColumns.map(
      (column, index) => `${this.quoteIdentifier(column)} = $${index + 1}`,
    );
    const schema = await this.loadSchemaMetadata();
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
    queryRunner: QueryRunner,
    companyId: string,
  ): Promise<boolean> {
    const rows = (await queryRunner.query(
      `SELECT 1 FROM ${this.quoteIdentifier('companies')} WHERE ${this.quoteIdentifier('id')} = $1 LIMIT 1`,
      [companyId],
    )) as unknown[];
    return rows.length > 0;
  }

  private async assertTargetCompanyDoesNotExist(
    queryRunner: QueryRunner,
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
    queryRunner: QueryRunner,
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

      const sql = `INSERT INTO ${this.quoteIdentifier(table)} (${columns
        .map((column) => this.quoteIdentifier(column))
        .join(', ')}) VALUES ${valuesSql.join(', ')}`;

      await queryRunner.query(sql, params);
    }
  }

  private async loadSchemaMetadata(): Promise<SchemaMetadata> {
    if (this.schemaMetadataCache) {
      return this.schemaMetadataCache;
    }

    const columnRows = (await this.dataSource.query(
      `
        SELECT table_name, column_name
             , data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
      `,
    )) as unknown as Array<{
      table_name: string;
      column_name: string;
      data_type: string;
    }>;

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

    const primaryKeyRows = (await this.dataSource.query(
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
    )) as unknown as Array<{
      table_name: string;
      column_name: string;
    }>;

    const primaryKeysByTable = new Map<string, string[]>();
    for (const row of primaryKeyRows) {
      const current = primaryKeysByTable.get(row.table_name) ?? [];
      current.push(row.column_name);
      primaryKeysByTable.set(row.table_name, current);
    }

    const foreignKeyRows = (await this.dataSource.query(
      `
        SELECT
          tc.table_name AS table_name,
          kcu.column_name AS column_name,
          ccu.table_name AS referenced_table_name,
          ccu.column_name AS referenced_column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
         AND ccu.table_schema = tc.table_schema
        WHERE tc.table_schema = 'public'
          AND tc.constraint_type = 'FOREIGN KEY'
      `,
    )) as unknown as Array<{
      table_name: string;
      column_name: string;
      referenced_table_name: string;
      referenced_column_name: string;
    }>;

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

  private async resolveSchemaVersion(): Promise<string | null> {
    try {
      const migrationTableLookup = (await this.dataSource.query(
        `SELECT to_regclass('public.migrations') AS migration_table`,
      )) as unknown as Array<{ migration_table?: unknown }>;
      const migrationTable = migrationTableLookup[0]?.migration_table;
      if (typeof migrationTable !== 'string' || migrationTable.length === 0) {
        return null;
      }

      const rows = (await this.dataSource.query(
        `SELECT name FROM "migrations" ORDER BY "timestamp" DESC LIMIT 1`,
      )) as unknown as Array<{ name?: unknown }>;
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
  ): Promise<Array<Record<string, unknown>>> {
    if (values.length === 0) {
      return [];
    }

    const sql = `SELECT * FROM ${this.quoteIdentifier(table)} WHERE CAST(${this.quoteIdentifier(column)} AS text) = ANY($1::text[])`;
    const rows = (await this.dataSource.query(sql, [
      values,
    ])) as unknown as Array<Record<string, unknown>>;
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
      return buffer;
    }

    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
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

    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(parsed.iv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(parsed.tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(parsed.data, 'base64url')),
      decipher.final(),
    ]);
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
      await fs.unlink(filePath);
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
      await fs.unlink(filePath);
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
