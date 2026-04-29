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
  };
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`${name} não configurado.`);
  }
  return value;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function parseDataUrl(value) {
  const match = String(value || '').match(/^data:([^;,]+);base64,(.+)$/i);
  if (!match) {
    throw new Error('logo_url inline inválida.');
  }
  const contentType = match[1].toLowerCase();
  if (!contentType.startsWith('image/')) {
    throw new Error(`Content-Type de logo não suportado: ${contentType}`);
  }
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0 || buffer.length > 2 * 1024 * 1024) {
    throw new Error(`Tamanho de logo inválido: ${buffer.length} bytes`);
  }
  return {
    contentType,
    buffer,
    digest: sha256(buffer),
    extension: resolveExtension(contentType),
  };
}

function resolveExtension(contentType) {
  switch (contentType) {
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/svg+xml':
      return 'svg';
    default:
      return 'bin';
  }
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

async function setAdminRlsContext(client) {
  await client.query(`SELECT set_config('app.is_super_admin', 'true', false)`);
}

async function readObjectBuffer(s3, bucket, key) {
  const response = await s3.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
  if (!response.Body) return Buffer.alloc(0);
  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function verifyExisting(client, s3, bucket, report) {
  const result = await client.query(`
    SELECT id, logo_storage_key, logo_sha256
    FROM companies
    WHERE logo_storage_key IS NOT NULL
    ORDER BY id
  `);

  for (const row of result.rows) {
    const object = await readObjectBuffer(s3, bucket, row.logo_storage_key);
    const actual = sha256(object);
    report.verified += 1;
    if (row.logo_sha256 && row.logo_sha256 !== actual) {
      report.hashMismatches.push({
        id: row.id,
        key: row.logo_storage_key,
        expected: row.logo_sha256,
        actual,
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
    type: 'externalize_company_logos',
    mode: options.verifyOnly ? 'verify-only' : options.apply ? 'apply' : 'dry-run',
    target: databaseConfig.target,
    scanned: 0,
    uploaded: 0,
    updated: 0,
    skippedExistingObject: 0,
    verified: 0,
    hashMismatches: [],
    failures: [],
  };

  try {
    await setAdminRlsContext(client);

    if (options.verifyOnly) {
      await verifyExisting(client, s3, bucket, report);
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    const result = await client.query(`
      SELECT id, logo_url
      FROM companies
      WHERE logo_url LIKE 'data:%'
        AND logo_storage_key IS NULL
      ORDER BY id
    `);

    for (const row of result.rows) {
      report.scanned += 1;
      try {
        const parsed = parseDataUrl(row.logo_url);
        const key = `companies/${row.id}/logo-${parsed.digest.slice(0, 16)}.${parsed.extension}`;
        if (!options.apply) continue;

        if (await objectExists(s3, bucket, key)) {
          report.skippedExistingObject += 1;
        } else {
          await s3.send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: key,
              Body: parsed.buffer,
              ContentType: parsed.contentType,
              Metadata: {
                sha256: parsed.digest,
                company_id: String(row.id),
              },
            }),
          );
          report.uploaded += 1;
        }

        const downloaded = await readObjectBuffer(s3, bucket, key);
        const actual = sha256(downloaded);
        if (actual !== parsed.digest) {
          report.hashMismatches.push({
            id: row.id,
            key,
            expected: parsed.digest,
            actual,
          });
          continue;
        }

        const update = await client.query(
          `
          UPDATE companies
          SET logo_url = NULL,
              logo_storage_key = $2,
              logo_content_type = $3,
              logo_sha256 = $4
          WHERE id = $1
            AND logo_url LIKE 'data:%'
            AND logo_storage_key IS NULL
          `,
          [row.id, key, parsed.contentType, parsed.digest],
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
