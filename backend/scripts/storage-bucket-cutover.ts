import {
  CopyObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { createHash } from 'crypto';
import * as path from 'path';
import {
  appendAuditLog,
  getStringArg,
  hasFlag,
  parseCliArgs,
  writeJsonFile,
} from './disaster-recovery/common';
import { DISASTER_RECOVERY_DEFAULT_BACKUP_ROOT } from '../src/disaster-recovery/disaster-recovery.constants';
import { resolveDisasterRecoveryEnvironment } from '../src/disaster-recovery/disaster-recovery.util';

type BucketRuntimeConfig = {
  bucketName: string | null;
  endpoint: string | null;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  configured: boolean;
};

type ListedObject = {
  key: string;
  sizeBytes: number;
  etag: string | null;
};

type PrefixSummary = {
  prefix: string;
  count: number;
  sizeBytes: number;
};

type ValidationSample = {
  key: string;
  sourceSizeBytes: number | null;
  targetSizeBytes: number | null;
  sourceContentType: string | null;
  targetContentType: string | null;
  sourceSha256: string | null;
  targetSha256: string | null;
  readableFromTarget: boolean;
  matched: boolean;
  message: string;
};

type ItemResult = {
  key: string;
  sizeBytes: number;
  action: 'planned' | 'copied' | 'skipped_existing' | 'failed';
  message: string;
};

type StorageCutoverReport = {
  version: 1;
  type: 'storage_bucket_cutover';
  status: 'dry_run' | 'success' | 'partial' | 'failed';
  environment: string;
  startedAt: string;
  completedAt: string;
  dryRun: boolean;
  source: {
    bucketName: string | null;
    endpoint: string | null;
    region: string;
    forcePathStyle: boolean;
  };
  target: {
    bucketName: string | null;
    endpoint: string | null;
    region: string;
    forcePathStyle: boolean;
  };
  options: {
    prefix: string | null;
    maxKeys: number | null;
    sampleSize: number;
    forceReplace: boolean;
    prefixGroupDepth: number;
  };
  inventory: {
    totalObjects: number;
    totalBytes: number;
    prefixSummary: PrefixSummary[];
    sampleKeys: string[];
  };
  execution: {
    planned: number;
    copied: number;
    skippedExisting: number;
    failed: number;
    itemLogPath: string | null;
  };
  validation: {
    targetObjectCount: number | null;
    missingKeysCount: number | null;
    missingKeysSample: string[];
    sampledReads: ValidationSample[];
  };
  notes: string[];
};

function getEnvFirst(keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function parseBooleanValue(
  rawValue: string | undefined,
  fallback: boolean,
): boolean {
  if (typeof rawValue === 'undefined') {
    return fallback;
  }
  return /^true$/i.test(rawValue);
}

function parsePositiveInteger(
  rawValue: string | undefined,
): number | undefined {
  if (!rawValue) {
    return undefined;
  }
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return Math.trunc(parsed);
}

function normalizeEndpoint(rawValue: string | null): string | null {
  if (!rawValue) {
    return null;
  }
  return rawValue.replace(/\/+$/, '');
}

function resolveSourceConfig(
  args: Record<string, string | boolean>,
): BucketRuntimeConfig {
  const bucketName =
    getStringArg(args, 'source-bucket') ||
    getEnvFirst(['AWS_BUCKET_NAME', 'AWS_S3_BUCKET']) ||
    null;
  const endpoint = normalizeEndpoint(
    getStringArg(args, 'source-endpoint') ||
      getEnvFirst(['AWS_ENDPOINT', 'AWS_S3_ENDPOINT']) ||
      null,
  );
  const region =
    getStringArg(args, 'source-region') ||
    getEnvFirst(['AWS_REGION']) ||
    'auto';
  const accessKeyId =
    getStringArg(args, 'source-access-key-id') ||
    getEnvFirst(['AWS_ACCESS_KEY_ID']) ||
    '';
  const secretAccessKey =
    getStringArg(args, 'source-secret-access-key') ||
    getEnvFirst(['AWS_SECRET_ACCESS_KEY']) ||
    '';
  const forcePathStyle = parseBooleanValue(
    getStringArg(args, 'source-force-path-style') ||
      getEnvFirst(['S3_FORCE_PATH_STYLE']),
    Boolean(endpoint),
  );

  return {
    bucketName,
    endpoint,
    region,
    accessKeyId,
    secretAccessKey,
    forcePathStyle,
    configured: Boolean(bucketName && accessKeyId && secretAccessKey),
  };
}

function resolveTargetConfig(
  args: Record<string, string | boolean>,
  source: BucketRuntimeConfig,
): BucketRuntimeConfig {
  const bucketName =
    getStringArg(args, 'target-bucket') ||
    getEnvFirst(['STORAGE_MIGRATION_TARGET_BUCKET']) ||
    null;
  const endpoint = normalizeEndpoint(
    getStringArg(args, 'target-endpoint') ||
      getEnvFirst(['STORAGE_MIGRATION_TARGET_ENDPOINT']) ||
      source.endpoint,
  );
  const region =
    getStringArg(args, 'target-region') ||
    getEnvFirst(['STORAGE_MIGRATION_TARGET_REGION']) ||
    source.region ||
    'auto';
  const accessKeyId =
    getStringArg(args, 'target-access-key-id') ||
    getEnvFirst(['STORAGE_MIGRATION_TARGET_ACCESS_KEY_ID']) ||
    source.accessKeyId;
  const secretAccessKey =
    getStringArg(args, 'target-secret-access-key') ||
    getEnvFirst(['STORAGE_MIGRATION_TARGET_SECRET_ACCESS_KEY']) ||
    source.secretAccessKey;
  const forcePathStyle = parseBooleanValue(
    getStringArg(args, 'target-force-path-style') ||
      getEnvFirst(['STORAGE_MIGRATION_TARGET_FORCE_PATH_STYLE']),
    source.forcePathStyle || Boolean(endpoint),
  );

  return {
    bucketName,
    endpoint,
    region,
    accessKeyId,
    secretAccessKey,
    forcePathStyle,
    configured: Boolean(bucketName && accessKeyId && secretAccessKey),
  };
}

function createStorageClient(config: BucketRuntimeConfig): S3Client {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint || undefined,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: config.forcePathStyle,
    requestHandler: new NodeHttpHandler({
      connectionTimeout: 2_000,
      socketTimeout: 30_000,
    }),
    maxAttempts: 3,
  });
}

function objectKeyPrefix(key: string, depth: number): string {
  const segments = key.split('/').filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    return '<root>';
  }
  return segments.slice(0, Math.max(1, depth)).join('/');
}

function buildCopySource(bucketName: string, key: string): string {
  const encodedKey = key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${bucketName}/${encodedKey}`;
}

function summarizePrefixes(
  objects: ListedObject[],
  depth: number,
): PrefixSummary[] {
  const summary = new Map<string, PrefixSummary>();
  for (const object of objects) {
    const prefix = objectKeyPrefix(object.key, depth);
    const current = summary.get(prefix) || {
      prefix,
      count: 0,
      sizeBytes: 0,
    };
    current.count += 1;
    current.sizeBytes += object.sizeBytes;
    summary.set(prefix, current);
  }

  return Array.from(summary.values()).sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }
    return left.prefix.localeCompare(right.prefix);
  });
}

async function listObjects(
  client: S3Client,
  bucketName: string,
  prefix: string | undefined,
  maxKeys: number | undefined,
): Promise<ListedObject[]> {
  const objects: ListedObject[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix,
        ContinuationToken: continuationToken,
        MaxKeys:
          maxKeys && maxKeys > 0
            ? Math.min(1000, Math.max(1, maxKeys - objects.length))
            : 1000,
      }),
    );

    for (const item of response.Contents || []) {
      if (!item.Key) {
        continue;
      }
      objects.push({
        key: item.Key,
        sizeBytes: Number(item.Size || 0),
        etag: item.ETag || null,
      });
      if (maxKeys && objects.length >= maxKeys) {
        return objects;
      }
    }

    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return objects;
}

async function headObject(
  client: S3Client,
  bucketName: string,
  key: string,
): Promise<{
  exists: boolean;
  contentLength: number | null;
  contentType: string | null;
  metadata: Record<string, string>;
}> {
  try {
    const response = await client.send(
      new HeadObjectCommand({
        Bucket: bucketName,
        Key: key,
      }),
    );
    return {
      exists: true,
      contentLength:
        typeof response.ContentLength === 'number'
          ? response.ContentLength
          : null,
      contentType: response.ContentType || null,
      metadata: response.Metadata || {},
    };
  } catch (error) {
    const candidate = error as {
      name?: string;
      $metadata?: { httpStatusCode?: number };
    };
    if (
      candidate.name === 'NotFound' ||
      candidate.name === 'NoSuchKey' ||
      candidate.$metadata?.httpStatusCode === 404
    ) {
      return {
        exists: false,
        contentLength: null,
        contentType: null,
        metadata: {},
      };
    }
    throw error;
  }
}

async function readObjectBuffer(
  client: S3Client,
  bucketName: string,
  key: string,
): Promise<Buffer> {
  const response = await client.send(
    new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    }),
  );

  const body = response.Body;
  if (!body || typeof body !== 'object') {
    throw new Error(`Objeto ${key} retornou body inválido.`);
  }

  if (
    'transformToByteArray' in body &&
    typeof body.transformToByteArray === 'function'
  ) {
    const bytes = await body.transformToByteArray();
    return Buffer.from(bytes);
  }

  if (
    Symbol.asyncIterator in body &&
    typeof body[Symbol.asyncIterator] === 'function'
  ) {
    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<
      Buffer | Uint8Array | string
    >) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  throw new Error(`Objeto ${key} retornou body não suportado.`);
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function buildOutputPaths(
  environment: string,
  customOutput: string | undefined,
) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupRoot =
    process.env.DR_BACKUP_ROOT || DISASTER_RECOVERY_DEFAULT_BACKUP_ROOT;
  const reportFileName = customOutput
    ? path.basename(customOutput)
    : `storage-bucket-cutover-${timestamp}.json`;
  if (
    customOutput !== undefined &&
    customOutput.trim().length > 0 &&
    reportFileName !== customOutput
  ) {
    throw new Error('--output deve ser apenas o nome do arquivo .json.');
  }
  if (!/^[a-zA-Z0-9._-]+\.json$/.test(reportFileName)) {
    throw new Error(
      '--output deve terminar em .json e conter apenas caracteres seguros.',
    );
  }
  const reportPath = `${backupRoot}${path.sep}reports${path.sep}${environment}${path.sep}${reportFileName}`;
  const itemLogPath = reportPath.replace(/\.json$/i, '.items.jsonl');
  const auditPath = path.resolve(
    process.cwd(),
    process.env.DR_BACKUP_ROOT || DISASTER_RECOVERY_DEFAULT_BACKUP_ROOT,
    'audit',
    'storage-bucket-cutover.jsonl',
  );
  return { reportPath, itemLogPath, auditPath };
}

async function appendItemLog(
  itemLogPath: string,
  payload: ItemResult,
): Promise<void> {
  await appendAuditLog(itemLogPath, {
    event: 'storage_bucket_cutover_item',
    status: payload.action,
    operation: 'storage_bucket_cutover',
    timestamp: new Date().toISOString(),
    metadata: payload,
  });
}

async function validateSamples(input: {
  sourceClient: S3Client;
  sourceBucket: string;
  targetClient: S3Client;
  targetBucket: string;
  sampleKeys: string[];
}): Promise<ValidationSample[]> {
  const results: ValidationSample[] = [];
  for (const key of input.sampleKeys) {
    const sourceHead = await headObject(
      input.sourceClient,
      input.sourceBucket,
      key,
    );
    const targetHead = await headObject(
      input.targetClient,
      input.targetBucket,
      key,
    );

    if (!sourceHead.exists || !targetHead.exists) {
      results.push({
        key,
        sourceSizeBytes: sourceHead.contentLength,
        targetSizeBytes: targetHead.contentLength,
        sourceContentType: sourceHead.contentType,
        targetContentType: targetHead.contentType,
        sourceSha256: null,
        targetSha256: null,
        readableFromTarget: false,
        matched: false,
        message:
          'Objeto ausente em uma das pontas durante a validação por amostra.',
      });
      continue;
    }

    const [sourceBuffer, targetBuffer] = await Promise.all([
      readObjectBuffer(input.sourceClient, input.sourceBucket, key),
      readObjectBuffer(input.targetClient, input.targetBucket, key),
    ]);
    const sourceSha = sha256(sourceBuffer);
    const targetSha = sha256(targetBuffer);

    results.push({
      key,
      sourceSizeBytes: sourceHead.contentLength,
      targetSizeBytes: targetHead.contentLength,
      sourceContentType: sourceHead.contentType,
      targetContentType: targetHead.contentType,
      sourceSha256: sourceSha,
      targetSha256: targetSha,
      readableFromTarget: true,
      matched:
        sourceHead.contentLength === targetHead.contentLength &&
        sourceHead.contentType === targetHead.contentType &&
        sourceSha === targetSha,
      message:
        sourceSha === targetSha
          ? 'Amostra validada com sucesso.'
          : 'Amostra divergiu entre origem e destino.',
    });
  }
  return results;
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const execute = hasFlag(args, 'execute');
  const dryRun = !execute || hasFlag(args, 'dry-run');
  const environment = resolveDisasterRecoveryEnvironment(
    getStringArg(args, 'environment') || process.env.DR_ENVIRONMENT_NAME,
    process.env.NODE_ENV,
  );
  const source = resolveSourceConfig(args);
  const target = resolveTargetConfig(args, source);
  const prefix = getStringArg(args, 'prefix');
  const maxKeys = parsePositiveInteger(getStringArg(args, 'max-keys'));
  const sampleSize =
    parsePositiveInteger(getStringArg(args, 'sample-size')) || 5;
  const prefixGroupDepth =
    parsePositiveInteger(getStringArg(args, 'prefix-group-depth')) || 1;
  const forceReplace = hasFlag(args, 'force-replace');
  const { reportPath, itemLogPath, auditPath } = buildOutputPaths(
    environment,
    getStringArg(args, 'output'),
  );

  const report: StorageCutoverReport = {
    version: 1,
    type: 'storage_bucket_cutover',
    status: dryRun ? 'dry_run' : 'success',
    environment,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    dryRun,
    source: {
      bucketName: source.bucketName,
      endpoint: source.endpoint,
      region: source.region,
      forcePathStyle: source.forcePathStyle,
    },
    target: {
      bucketName: target.bucketName,
      endpoint: target.endpoint,
      region: target.region,
      forcePathStyle: target.forcePathStyle,
    },
    options: {
      prefix: prefix || null,
      maxKeys: maxKeys ?? null,
      sampleSize,
      forceReplace,
      prefixGroupDepth,
    },
    inventory: {
      totalObjects: 0,
      totalBytes: 0,
      prefixSummary: [],
      sampleKeys: [],
    },
    execution: {
      planned: 0,
      copied: 0,
      skippedExisting: 0,
      failed: 0,
      itemLogPath: dryRun ? null : itemLogPath,
    },
    validation: {
      targetObjectCount: null,
      missingKeysCount: null,
      missingKeysSample: [],
      sampledReads: [],
    },
    notes: [],
  };

  if (!source.configured) {
    report.status = 'failed';
    report.notes.push(
      'Storage de origem não configurado. Defina AWS_BUCKET_NAME/AWS_S3_BUCKET e credenciais válidas, ou use flags --source-*.',
    );
    report.completedAt = new Date().toISOString();
    await writeJsonFile(reportPath, report);
    await appendAuditLog(auditPath, {
      event: 'storage_bucket_cutover_failed',
      status: 'failed',
      operation: 'storage_bucket_cutover',
      timestamp: report.completedAt,
      metadata: {
        reportPath,
        reason: 'source_storage_not_configured',
      },
    });
    throw new Error(report.notes[0]);
  }

  if (!target.configured) {
    report.status = 'failed';
    report.notes.push(
      'Storage de destino não configurado. Defina STORAGE_MIGRATION_TARGET_* ou use flags --target-*.',
    );
    report.completedAt = new Date().toISOString();
    await writeJsonFile(reportPath, report);
    await appendAuditLog(auditPath, {
      event: 'storage_bucket_cutover_failed',
      status: 'failed',
      operation: 'storage_bucket_cutover',
      timestamp: report.completedAt,
      metadata: {
        reportPath,
        reason: 'target_storage_not_configured',
      },
    });
    throw new Error(report.notes[0]);
  }

  if (
    source.bucketName === target.bucketName &&
    source.endpoint === target.endpoint
  ) {
    report.status = 'failed';
    report.notes.push(
      'Origem e destino apontam para o mesmo bucket/endpoint. O cutover exige buckets distintos.',
    );
    report.completedAt = new Date().toISOString();
    await writeJsonFile(reportPath, report);
    await appendAuditLog(auditPath, {
      event: 'storage_bucket_cutover_failed',
      status: 'failed',
      operation: 'storage_bucket_cutover',
      timestamp: report.completedAt,
      metadata: {
        reportPath,
        reason: 'source_equals_target',
      },
    });
    throw new Error(report.notes[0]);
  }

  const sourceClient = createStorageClient(source);
  const targetClient = createStorageClient(target);

  const sourceObjects = await listObjects(
    sourceClient,
    source.bucketName!,
    prefix,
    maxKeys,
  );

  report.inventory.totalObjects = sourceObjects.length;
  report.inventory.totalBytes = sourceObjects.reduce(
    (total, object) => total + object.sizeBytes,
    0,
  );
  report.inventory.prefixSummary = summarizePrefixes(
    sourceObjects,
    prefixGroupDepth,
  );
  report.inventory.sampleKeys = sourceObjects
    .slice(0, Math.min(sampleSize, sourceObjects.length))
    .map((object) => object.key);
  report.execution.planned = sourceObjects.length;

  if (dryRun) {
    report.notes.push(
      'Dry-run executado. Nenhum objeto foi copiado para o bucket de destino.',
    );
    report.completedAt = new Date().toISOString();
    await writeJsonFile(reportPath, report);
    await appendAuditLog(auditPath, {
      event: 'storage_bucket_cutover_dry_run',
      status: 'dry_run',
      operation: 'storage_bucket_cutover',
      timestamp: report.completedAt,
      metadata: {
        reportPath,
        sourceBucket: source.bucketName,
        targetBucket: target.bucketName,
        totalObjects: report.inventory.totalObjects,
        totalBytes: report.inventory.totalBytes,
      },
    });
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  for (const object of sourceObjects) {
    try {
      const targetHead = await headObject(
        targetClient,
        target.bucketName!,
        object.key,
      );
      if (targetHead.exists && !forceReplace) {
        report.execution.skippedExisting += 1;
        await appendItemLog(itemLogPath, {
          key: object.key,
          sizeBytes: object.sizeBytes,
          action: 'skipped_existing',
          message: 'Objeto já existia no bucket de destino.',
        });
        continue;
      }

      await targetClient.send(
        new CopyObjectCommand({
          Bucket: target.bucketName!,
          Key: object.key,
          CopySource: buildCopySource(source.bucketName!, object.key),
          MetadataDirective: 'COPY',
        }),
      );

      report.execution.copied += 1;
      await appendItemLog(itemLogPath, {
        key: object.key,
        sizeBytes: object.sizeBytes,
        action: 'copied',
        message: 'Objeto copiado preservando a mesma key.',
      });
    } catch (error) {
      report.execution.failed += 1;
      report.status = 'partial';
      await appendItemLog(itemLogPath, {
        key: object.key,
        sizeBytes: object.sizeBytes,
        action: 'failed',
        message: error instanceof Error ? error.message : 'copy_failed',
      });
    }
  }

  const targetObjects = await listObjects(
    targetClient,
    target.bucketName!,
    prefix,
    maxKeys,
  );
  const targetKeySet = new Set(targetObjects.map((object) => object.key));
  const missingKeys = sourceObjects
    .map((object) => object.key)
    .filter((key) => !targetKeySet.has(key));

  report.validation.targetObjectCount = targetObjects.length;
  report.validation.missingKeysCount = missingKeys.length;
  report.validation.missingKeysSample = missingKeys.slice(0, 20);
  report.validation.sampledReads = await validateSamples({
    sourceClient,
    sourceBucket: source.bucketName!,
    targetClient,
    targetBucket: target.bucketName!,
    sampleKeys: report.inventory.sampleKeys,
  });

  if (
    missingKeys.length > 0 ||
    report.validation.sampledReads.some((sample) => !sample.matched)
  ) {
    report.status = 'partial';
    report.notes.push(
      'Validação pós-cópia encontrou divergências. Revise missingKeysSample e sampledReads antes do cutover.',
    );
  } else if (report.execution.failed > 0) {
    report.status = 'partial';
    report.notes.push(
      'Cópia concluída com falhas pontuais. Revise o item log antes do cutover.',
    );
  } else {
    report.status = 'success';
    report.notes.push(
      'Cópia concluída com validação básica por amostragem e conferência de presença das keys.',
    );
  }

  report.completedAt = new Date().toISOString();
  await writeJsonFile(reportPath, report);
  await appendAuditLog(auditPath, {
    event: 'storage_bucket_cutover_completed',
    status: report.status,
    operation: 'storage_bucket_cutover',
    timestamp: report.completedAt,
    metadata: {
      reportPath,
      itemLogPath,
      sourceBucket: source.bucketName,
      targetBucket: target.bucketName,
      copied: report.execution.copied,
      skippedExisting: report.execution.skippedExisting,
      failed: report.execution.failed,
      missingKeysCount: report.validation.missingKeysCount,
    },
  });

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(
    '[STORAGE][CUTOVER] Falha:',
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
