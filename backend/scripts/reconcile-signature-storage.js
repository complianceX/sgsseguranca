const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} = require('@aws-sdk/client-s3');
const { connectRuntimePgClient } = require('./lib/pg-runtime-client');

for (const envFile of ['.env', '../.env', '../.env.local']) {
  const resolved = path.resolve(__dirname, envFile);
  if (fs.existsSync(resolved)) {
    dotenv.config({ path: resolved, override: false });
  }
}

function parseArgs(argv) {
  return {
    apply: argv.includes('--apply'),
    verifyOnly: argv.includes('--verify-only'),
    limit: Number(
      argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] || '0',
    ),
  };
}

function sha256(value) {
  return crypto.createHash('sha256').update(value || '').digest('hex');
}

function firstNonEmptyEnv(names) {
  for (const name of names) {
    const value = process.env[name];
    if (value && String(value).trim()) {
      return String(value).trim();
    }
  }
  return '';
}

function parseBoolean(raw, fallback) {
  if (typeof raw !== 'string' || !raw.trim()) {
    return fallback;
  }
  return /^true$/i.test(raw.trim());
}

function resolveStorageConfig(prefix, fallbackToPrimary = false) {
  const key = (name) => `${prefix}_${name}`;
  const bucket =
    firstNonEmptyEnv([key('BUCKET'), key('BUCKET_NAME'), key('S3_BUCKET')]) ||
    (fallbackToPrimary
      ? firstNonEmptyEnv(['AWS_BUCKET_NAME', 'AWS_S3_BUCKET'])
      : '');
  const endpoint =
    firstNonEmptyEnv([key('ENDPOINT'), key('S3_ENDPOINT')]) ||
    (fallbackToPrimary
      ? firstNonEmptyEnv(['AWS_ENDPOINT', 'AWS_S3_ENDPOINT'])
      : '');
  const region =
    firstNonEmptyEnv([key('REGION')]) ||
    (fallbackToPrimary ? firstNonEmptyEnv(['AWS_REGION']) : '') ||
    'auto';
  const accessKeyId =
    firstNonEmptyEnv([key('ACCESS_KEY_ID')]) ||
    (fallbackToPrimary ? firstNonEmptyEnv(['AWS_ACCESS_KEY_ID']) : '');
  const secretAccessKey =
    firstNonEmptyEnv([key('SECRET_ACCESS_KEY')]) ||
    (fallbackToPrimary ? firstNonEmptyEnv(['AWS_SECRET_ACCESS_KEY']) : '');
  const forcePathStyle = parseBoolean(
    firstNonEmptyEnv([key('FORCE_PATH_STYLE')]) ||
      (fallbackToPrimary ? firstNonEmptyEnv(['S3_FORCE_PATH_STYLE']) : ''),
    Boolean(endpoint),
  );

  return {
    bucket,
    endpoint,
    region,
    accessKeyId,
    secretAccessKey,
    forcePathStyle,
    configured: Boolean(bucket && accessKeyId && secretAccessKey),
  };
}

function createS3Client(config) {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint || undefined,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: config.forcePathStyle,
  });
}

function publicStorageConfig(config) {
  return {
    bucket: config.bucket || null,
    endpoint: config.endpoint || null,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    configured: config.configured,
  };
}

function isMissingObjectError(error) {
  return (
    error &&
    (error.name === 'NoSuchKey' ||
      error.name === 'NotFound' ||
      error.$metadata?.httpStatusCode === 404)
  );
}

async function headObject(client, bucket, key) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error) {
    if (isMissingObjectError(error)) {
      return false;
    }
    throw error;
  }
}

async function readObject(client, bucket, key) {
  const response = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  const chunks = [];
  for await (const chunk of response.Body || []) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return {
    body: Buffer.concat(chunks),
    contentType: response.ContentType || 'application/octet-stream',
    metadata: response.Metadata || {},
  };
}

function pushSample(collection, item, limit = 10) {
  if (collection.length < limit) {
    collection.push(item);
  }
}

function hasBlockingIssues(report) {
  return (
    report.sourceMissing.count > 0 ||
    report.targetMissingAfter.count > 0 ||
    report.hashMismatches.length > 0 ||
    report.failures.length > 0 ||
    (report.targetMissingBefore.count > 0 &&
      report.mode !== 'dry-run' &&
      report.copied === 0)
  );
}

async function listSignatureKeys(client, limit) {
  const params = [];
  let limitClause = '';
  if (Number.isFinite(limit) && limit > 0) {
    params.push(Math.trunc(limit));
    limitClause = 'LIMIT $1';
  }

  return client.query(
    `
    SELECT id, signature_data_key, integrity_payload
    FROM signatures
    WHERE signature_data IS NULL
      AND signature_data_key IS NOT NULL
    ORDER BY created_at ASC
    ${limitClause}
    `,
    params,
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const target = resolveStorageConfig('SIGNATURE_STORAGE_TARGET', true);
  const source = resolveStorageConfig('SIGNATURE_STORAGE_SOURCE', false);

  if (!target.configured) {
    throw new Error(
      'Storage de destino nao configurado. Configure AWS_BUCKET_NAME/AWS_S3_BUCKET e credenciais AWS_*.',
    );
  }

  if (options.apply && !source.configured) {
    throw new Error(
      'Apply exige SIGNATURE_STORAGE_SOURCE_* configurado para copiar objetos antigos.',
    );
  }

  if (
    options.apply &&
    source.bucket === target.bucket &&
    source.endpoint === target.endpoint
  ) {
    throw new Error('Origem e destino apontam para o mesmo bucket/endpoint.');
  }

  const targetClient = createS3Client(target);
  const sourceClient = source.configured ? createS3Client(source) : null;
  const { client, databaseConfig } = await connectRuntimePgClient({
    useAdministrativeConfig: true,
  });

  const report = {
    version: 1,
    type: 'signature_storage_reconciliation',
    mode: options.verifyOnly ? 'verify-only' : options.apply ? 'apply' : 'dry-run',
    target: databaseConfig.target,
    sourceStorage: publicStorageConfig(source),
    targetStorage: publicStorageConfig(target),
    scanned: 0,
    targetExisting: 0,
    targetMissingBefore: { count: 0, samples: [] },
    sourceAvailable: 0,
    sourceMissing: { count: 0, samples: [] },
    plannedCopies: 0,
    copied: 0,
    skippedExisting: 0,
    verifiedAfterCopy: 0,
    targetMissingAfter: { count: 0, samples: [] },
    hashMismatches: [],
    failures: [],
    notes: [],
  };

  try {
    const result = await listSignatureKeys(client, options.limit);
    for (const row of result.rows) {
      report.scanned += 1;
      const key = row.signature_data_key;
      const expectedHash = row.integrity_payload?.signature_evidence_hash || null;

      try {
        const targetExists = await headObject(targetClient, target.bucket, key);
        if (targetExists) {
          report.targetExisting += 1;
          continue;
        }

        report.targetMissingBefore.count += 1;
        pushSample(report.targetMissingBefore.samples, { id: row.id, key });

        if (!sourceClient) {
          continue;
        }

        let sourceObject;
        try {
          sourceObject = await readObject(sourceClient, source.bucket, key);
        } catch (error) {
          if (isMissingObjectError(error)) {
            report.sourceMissing.count += 1;
            pushSample(report.sourceMissing.samples, { id: row.id, key });
            continue;
          }
          throw error;
        }

        report.sourceAvailable += 1;
        const sourceHash = sha256(sourceObject.body);
        if (expectedHash && expectedHash !== sourceHash) {
          report.hashMismatches.push({
            id: row.id,
            key,
            expected: expectedHash,
            actual: sourceHash,
            stage: 'source',
          });
          continue;
        }

        report.plannedCopies += 1;
        if (!options.apply || options.verifyOnly) {
          continue;
        }

        await targetClient.send(
          new PutObjectCommand({
            Bucket: target.bucket,
            Key: key,
            Body: sourceObject.body,
            ContentType: sourceObject.contentType,
            Metadata: sourceObject.metadata,
          }),
        );
        report.copied += 1;

        const copiedObject = await readObject(targetClient, target.bucket, key);
        const copiedHash = sha256(copiedObject.body);
        if (copiedHash !== sourceHash) {
          report.hashMismatches.push({
            id: row.id,
            key,
            expected: sourceHash,
            actual: copiedHash,
            stage: 'target_after_copy',
          });
          continue;
        }
        report.verifiedAfterCopy += 1;
      } catch (error) {
        report.failures.push({
          id: row.id,
          key,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (options.apply) {
      for (const row of result.rows) {
        const exists = await headObject(
          targetClient,
          target.bucket,
          row.signature_data_key,
        );
        if (!exists) {
          report.targetMissingAfter.count += 1;
          pushSample(report.targetMissingAfter.samples, {
            id: row.id,
            key: row.signature_data_key,
          });
        }
      }
    }

    if (!source.configured && report.targetMissingBefore.count > 0) {
      report.notes.push(
        'Destino tem objetos ausentes e nenhuma origem foi configurada. Configure SIGNATURE_STORAGE_SOURCE_* com o storage antigo.',
      );
    }
    if (!options.apply && source.configured && report.plannedCopies > 0) {
      report.notes.push(
        'Dry-run encontrou objetos copiaveis. Rode com --apply apenas em janela controlada.',
      );
    }
  } finally {
    await client.end();
  }

  console.log(JSON.stringify(report, null, 2));

  if (hasBlockingIssues(report)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
