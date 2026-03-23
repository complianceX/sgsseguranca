export const DISASTER_RECOVERY_OPERATION_TYPES = [
  'database_backup',
  'database_restore',
  'integrity_scan',
  'storage_inventory',
  'storage_replication',
  'environment_recovery_validation',
] as const;

export type DisasterRecoveryOperationType =
  (typeof DISASTER_RECOVERY_OPERATION_TYPES)[number];

export const DISASTER_RECOVERY_EXECUTION_STATUSES = [
  'running',
  'success',
  'failed',
  'dry_run',
  'partial',
] as const;

export type DisasterRecoveryExecutionStatus =
  (typeof DISASTER_RECOVERY_EXECUTION_STATUSES)[number];

export const DISASTER_RECOVERY_SCOPES = [
  'database',
  'storage',
  'system',
] as const;

export type DisasterRecoveryScope = (typeof DISASTER_RECOVERY_SCOPES)[number];

export const DISASTER_RECOVERY_INTEGRITY_SEVERITIES = [
  'critical',
  'high',
  'medium',
  'low',
] as const;

export type DisasterRecoveryIntegritySeverity =
  (typeof DISASTER_RECOVERY_INTEGRITY_SEVERITIES)[number];

export const DISASTER_RECOVERY_INTEGRITY_ISSUE_TYPES = [
  'storage_backend_unavailable',
  'registry_missing_artifact',
  'registry_hash_mismatch',
  'video_missing_artifact',
  'attachment_missing_artifact',
  'apr_evidence_missing_artifact',
  'apr_evidence_hash_mismatch',
  'storage_orphan_artifact',
] as const;

export type DisasterRecoveryIntegrityIssueType =
  (typeof DISASTER_RECOVERY_INTEGRITY_ISSUE_TYPES)[number];

export type DisasterRecoveryExecutionMetadata = Record<string, unknown>;

export type DisasterRecoveryExecutionInput = {
  operationType: DisasterRecoveryOperationType;
  scope: DisasterRecoveryScope;
  environment: string;
  targetEnvironment?: string | null;
  triggerSource: string;
  requestedByUserId?: string | null;
  backupName?: string | null;
  artifactPath?: string | null;
  artifactStorageKey?: string | null;
  metadata?: DisasterRecoveryExecutionMetadata | null;
};

export type DisasterRecoveryExecutionResultInput = {
  status: Exclude<DisasterRecoveryExecutionStatus, 'running'>;
  backupName?: string | null;
  artifactPath?: string | null;
  artifactStorageKey?: string | null;
  errorMessage?: string | null;
  metadata?: DisasterRecoveryExecutionMetadata | null;
};

export type DisasterRecoveryIntegrityIssue = {
  severity: DisasterRecoveryIntegritySeverity;
  issueType: DisasterRecoveryIntegrityIssueType;
  module: string;
  companyId: string | null;
  entityId: string | null;
  fileKey: string | null;
  expectedHash?: string | null;
  actualHash?: string | null;
  message: string;
  metadata?: Record<string, unknown>;
};

export type DisasterRecoveryArtifactInventoryItem = {
  source:
    | 'registry'
    | 'video'
    | 'cat_attachment'
    | 'nonconformity_attachment'
    | 'apr_evidence';
  module: string;
  companyId: string | null;
  entityId: string;
  fileKey: string;
  expectedHash?: string | null;
  expectedAvailability?: string | null;
  metadata?: Record<string, unknown>;
};

export type DisasterRecoveryIntegrityScanOptions = {
  companyId?: string;
  verifyHashes?: boolean;
  includeOrphans?: boolean;
  limitPerSource?: number;
};

export type DisasterRecoveryIntegrityScanSummary = {
  environment: string;
  startedAt: string;
  completedAt: string;
  degraded: boolean;
  storageConfigured: boolean;
  storageTarget: {
    mode: 'managed' | 'legacy' | 'unconfigured';
    bucketName: string | null;
    endpoint: string | null;
  };
  scannedRegistryDocuments: number;
  scannedGovernedVideos: number;
  scannedGovernedAttachments: number;
  scannedAprEvidences: number;
  orphanArtifactsFound: number;
  criticalIssues: number;
  highIssues: number;
  mediumIssues: number;
  lowIssues: number;
};

export type DisasterRecoveryIntegrityScanReport = {
  summary: DisasterRecoveryIntegrityScanSummary;
  issues: DisasterRecoveryIntegrityIssue[];
  inventory: DisasterRecoveryArtifactInventoryItem[];
  orphanKeys: string[];
  scannedPrefixes: string[];
};

export type DisasterRecoveryStorageProtectionItem = {
  fileKey: string;
  module: string;
  companyId: string | null;
  entityId: string;
  sourceExists: boolean;
  replicaExistsBefore: boolean;
  replicaExistsAfter: boolean;
  action:
    | 'planned'
    | 'copied'
    | 'skipped_existing'
    | 'source_missing'
    | 'failed';
  contentType: string;
  sha256: string | null;
  sizeBytes: number | null;
  message: string;
};

export type DisasterRecoveryStorageProtectionReport = {
  summary: {
    environment: string;
    startedAt: string;
    completedAt: string;
    dryRun: boolean;
    replicaConfigured: boolean;
    sourceStorageConfigured: boolean;
    totalInventory: number;
    copied: number;
    skippedExisting: number;
    sourceMissing: number;
    failed: number;
  };
  source: {
    mode: 'managed' | 'legacy' | 'unconfigured';
    bucketName: string | null;
    endpoint: string | null;
  };
  replica: {
    configured: boolean;
    bucketName: string | null;
    endpoint: string | null;
    strategy: 'secondary_bucket_replication';
  };
  notes: string[];
  items: DisasterRecoveryStorageProtectionItem[];
};
