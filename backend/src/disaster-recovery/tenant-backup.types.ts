export type TenantRestoreMode = 'overwrite_same_tenant' | 'clone_to_new_tenant';

export type TenantBackupTablePayload = {
  primaryKeyColumns: string[];
  rowCount: number;
  rows: Array<Record<string, unknown>>;
};

export type TenantBackupSchema = {
  version: string | null;
  exportedAt: string;
};

export type TenantBackupPayload = {
  version: 1;
  backupId: string;
  companyId: string;
  exportedAt: string;
  schema: TenantBackupSchema;
  checksumSha256: string;
  rowCounts: Record<string, number>;
  tables: Record<string, TenantBackupTablePayload>;
  notes: string[];
};

export type TenantBackupListItem = {
  backupId: string;
  companyId: string;
  exportedAt: string;
  checksumSha256: string;
  filePath: string;
  fileSizeBytes: number;
  schemaVersion: string | null;
  rowCounts: Record<string, number>;
};

export type TenantBackupExecutionResult = {
  backupId: string;
  companyId: string;
  exportedAt: string;
  filePath: string;
  metadataPath: string;
  checksumSha256: string;
  rowCounts: Record<string, number>;
  schemaVersion: string | null;
};

export type TenantRestoreExecutionResult = {
  backupId: string;
  sourceCompanyId: string;
  targetCompanyId: string;
  mode: TenantRestoreMode;
  restoredTables: string[];
  restoredRowsByTable: Record<string, number>;
};

export type TenantBackupJobData =
  | {
      type: 'backup_tenant';
      companyId: string;
      triggerSource: 'manual' | 'scheduled_daily';
      requestedByUserId?: string;
    }
  | {
      type: 'backup_all_active_tenants';
      triggerSource: 'scheduled_daily';
      requestedByUserId?: string;
    }
  | {
      type: 'restore_tenant';
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
    }
  | {
      type: 'prune_tenant_backups';
    };
