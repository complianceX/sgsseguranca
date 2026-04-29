const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
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
    allowLocalStorage: argv.includes('--allow-local-storage'),
    limit: Number(
      argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] || '0',
    ),
  };
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`${name} não configurado.`);
  }
  return value;
}

function createS3Client() {
  return new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    endpoint: process.env.AWS_ENDPOINT || undefined,
    credentials: {
      accessKeyId: requireEnv('AWS_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('AWS_SECRET_ACCESS_KEY'),
    },
    forcePathStyle: true,
  });
}

function assertStorageTargetSafeForApply(options) {
  if (!options.apply) return;
  const endpoint = String(process.env.AWS_ENDPOINT || '').toLowerCase();
  const isLocalEndpoint =
    endpoint.includes('127.0.0.1') ||
    endpoint.includes('localhost') ||
    endpoint.includes('host.docker.internal');
  if (isLocalEndpoint && !options.allowLocalStorage) {
    throw new Error(
      'AWS_ENDPOINT aponta para storage local. Use credenciais de storage de produção ou --allow-local-storage explicitamente.',
    );
  }
}

async function readObjectAsString(s3, bucket, key) {
  const response = await s3.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
  if (!response.Body) return '';
  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function objectExists(s3, bucket, key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error) {
    if (
      error &&
      (error.name === 'NotFound' ||
        error.name === 'NoSuchKey' ||
        error.$metadata?.httpStatusCode === 404)
    ) {
      return false;
    }
    throw error;
  }
}

function buildKey(row, digest) {
  const documentId = String(row.document_id || 'unknown-document').replace(
    /[^a-zA-Z0-9_.-]/g,
    '_',
  );
  const type = String(row.type || 'signature').replace(/[^a-zA-Z0-9_.-]/g, '_');
  return `signatures/${documentId}/${type}-${row.id}-${digest.slice(0, 16)}.dat`;
}

async function verifyExisting(client, s3, bucket, report) {
  const result = await client.query(`
    SELECT id, signature_data_key, integrity_payload
    FROM signatures
    WHERE signature_data IS NULL
      AND signature_data_key IS NOT NULL
    ORDER BY created_at ASC
  `);

  for (const row of result.rows) {
    const raw = await readObjectAsString(s3, bucket, row.signature_data_key);
    const digest = sha256(raw);
    const expected = row.integrity_payload?.signature_evidence_hash || null;
    report.verified += 1;
    if (expected && expected !== digest) {
      report.hashMismatches.push({
        id: row.id,
        key: row.signature_data_key,
        expected,
        actual: digest,
      });
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  assertStorageTargetSafeForApply(options);
  const bucket = requireEnv('AWS_BUCKET_NAME');
  const s3 = createS3Client();
  const { client, databaseConfig } = await connectRuntimePgClient({
    useAdministrativeConfig: true,
  });

  const report = {
    version: 1,
    type: 'externalize_signature_data',
    mode: options.verifyOnly ? 'verify-only' : options.apply ? 'apply' : 'dry-run',
    target: databaseConfig.target,
    bucketConfigured: Boolean(bucket),
    scanned: 0,
    uploaded: 0,
    updated: 0,
    skippedExistingObject: 0,
    verified: 0,
    hashMismatches: [],
    failures: [],
  };

  try {
    if (options.verifyOnly) {
      await verifyExisting(client, s3, bucket, report);
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    const params = [];
    let limitClause = '';
    if (Number.isFinite(options.limit) && options.limit > 0) {
      params.push(Math.trunc(options.limit));
      limitClause = 'LIMIT $1';
    }

    const result = await client.query(
      `
      SELECT
        id,
        document_id,
        type,
        signature_data,
        signature_data_key,
        integrity_payload
      FROM signatures
      WHERE signature_data IS NOT NULL
        AND signature_data_key IS NULL
      ORDER BY created_at ASC
      ${limitClause}
      `,
      params,
    );

    for (const row of result.rows) {
      report.scanned += 1;
      const digest = sha256(row.signature_data);
      const expected = row.integrity_payload?.signature_evidence_hash || null;
      if (expected && expected !== digest) {
        report.hashMismatches.push({
          id: row.id,
          expected,
          actual: digest,
        });
        continue;
      }

      const key = buildKey(row, digest);
      if (!options.apply) {
        continue;
      }

      try {
        if (await objectExists(s3, bucket, key)) {
          report.skippedExistingObject += 1;
        } else {
          await s3.send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: key,
              Body: Buffer.from(row.signature_data, 'utf8'),
              ContentType: 'application/octet-stream',
              Metadata: {
                sha256: digest,
                signature_id: String(row.id),
              },
            }),
          );
          report.uploaded += 1;
        }

        const downloaded = await readObjectAsString(s3, bucket, key);
        const downloadedDigest = sha256(downloaded);
        if (downloadedDigest !== digest) {
          report.hashMismatches.push({
            id: row.id,
            key,
            expected: digest,
            actual: downloadedDigest,
          });
          continue;
        }

        const update = await client.query(
          `
          UPDATE signatures
          SET signature_data = NULL,
              signature_data_key = $2
          WHERE id = $1
            AND signature_data IS NOT NULL
            AND signature_data_key IS NULL
          `,
          [row.id, key],
        );
        report.updated += update.rowCount || 0;
      } catch (error) {
        report.failures.push({
          id: row.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await verifyExisting(client, s3, bucket, report);
  } finally {
    await client.end();
  }

  console.log(JSON.stringify(report, null, 2));

  if (report.hashMismatches.length > 0 || report.failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
