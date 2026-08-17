import crypto from 'node:crypto';
import { createRequire } from 'node:module';

// O runner é montado em /opt/load-test, enquanto as dependências vivem em /app.
// Resolver pelo package.json da aplicação mantém o teste determinístico dentro
// do container sem duplicar dependências no diretório de operações.
const require = createRequire('/app/package.json');
const { Client } = require('pg');
const {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const baseUrl = process.env.LOADTEST_API_URL || 'http://api-loadtest:3001';
const otherCompanyId = '00000000-0000-4000-8000-000000000099';

function cookiePair(setCookies) {
  const values = new Map();
  for (const raw of Array.isArray(setCookies) ? setCookies : [setCookies]) {
    const pair = String(raw || '').split(';', 1)[0];
    const separator = pair.indexOf('=');
    if (separator > 0) values.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
  return [...values.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

const csrf = await fetch(`${baseUrl}/auth/csrf`);
const csrfPayload = await csrf.json();
const csrfCookies = typeof csrf.headers.getSetCookie === 'function'
  ? csrf.headers.getSetCookie()
  : [csrf.headers.get('set-cookie') || ''];
const csrfCookie = cookiePair(csrfCookies);
const login = await fetch(`${baseUrl}/auth/login`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    cookie: csrfCookie,
    'x-csrf-token': csrfPayload.csrfToken,
  },
  body: JSON.stringify({
    cpf: process.env.LOADTEST_ADMIN_CPF,
    password: process.env.LOADTEST_ADMIN_PASSWORD,
  }),
});
const loginPayload = await login.json();
console.log(`REGISTRY_LOGIN_STATUS=${login.status}`);
const token = loginPayload.accessToken || loginPayload.access_token;
const me = await (await fetch(`${baseUrl}/auth/me`, {
  headers: { authorization: `Bearer ${token}` },
})).json();
console.log(`REGISTRY_TOKEN_PRESENT=${Boolean(token)}`);
const companyId = me.company_id || me.companyId || me.user?.company_id;
const userId = me.id || me.user?.id || me.user?.userId;
console.log(`REGISTRY_COMPANY_PRESENT=${Boolean(companyId)}`);
const headers = {
  authorization: `Bearer ${token}`,
  'x-company-id': companyId,
  cookie: csrfCookie,
  'x-csrf-token': csrfPayload.csrfToken,
};

const pdf = Buffer.from(`%PDF-1.4\n% registry fixture\n${'r'.repeat(180)}\n%%EOF\n`, 'utf8');
const sha256 = crypto.createHash('sha256').update(pdf).digest('hex');
const presign = await fetch(`${baseUrl}/storage/presigned-url`, {
  method: 'POST',
  headers: { ...headers, 'content-type': 'application/json' },
  body: JSON.stringify({ filename: 'registry-provider-test.pdf', contentType: 'application/pdf' }),
});
const presignPayload = await presign.json();
console.log(`REGISTRY_PRESIGN_STATUS=${presign.status}`);
if (!presign.ok || !presignPayload.uploadUrl || !presignPayload.fileKey) {
  console.log(`REGISTRY_PRESIGN_ERROR=${String(presignPayload.message || 'unknown')}`);
  throw new Error('registry_presign_failed');
}
const put = await fetch(presignPayload.uploadUrl, {
  method: 'PUT',
  headers: { 'content-type': 'application/pdf' },
  body: pdf,
});
const complete = await fetch(`${baseUrl}/storage/complete-upload`, {
  method: 'POST',
  headers: { ...headers, 'content-type': 'application/json' },
  body: JSON.stringify({
    fileKey: presignPayload.fileKey,
    originalFilename: 'registry-provider-test.pdf',
    sha256,
  }),
});
const completePayload = await complete.json();
console.log(`UPLOAD_CHAIN=${presign.status}/${put.status}/${complete.status}`);
if (!complete.ok || !completePayload.fileKey) throw new Error('upload_chain_failed');

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.AWS_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
let promotedHeadStatus = 'missing';
try {
  await s3.send(new HeadObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: completePayload.fileKey,
  }));
  promotedHeadStatus = 'present';
} catch {
  promotedHeadStatus = 'missing';
}
console.log(`PROMOTED_OBJECT=${promotedHeadStatus}`);

const db = new Client({
  connectionString: process.env.DATABASE_MIGRATION_URL,
});
await db.connect();
const registryId = crypto.randomUUID();
const entityId = crypto.randomUUID();
const siteId = process.env.LOADTEST_SITE_ID;
await db.query("DELETE FROM document_registry WHERE title = 'Synthetic provider registry fixture'");
await db.query(
  `INSERT INTO document_registry
    (id, company_id, module, document_type, entity_id, title, document_date,
     iso_year, iso_week, file_key, folder_path, original_name, mime_type,
     file_hash, document_code, status, finalized_at, created_by)
   VALUES ($1, $2, 'dds', 'pdf', $3, 'Synthetic provider registry fixture', CURRENT_DATE,
     EXTRACT(YEAR FROM CURRENT_DATE)::int, EXTRACT(WEEK FROM CURRENT_DATE)::int,
     $4, $5, 'registry-provider-test.pdf', 'application/pdf', $6,
     $7, 'ACTIVE', NOW(), $8)`,
  [registryId, companyId, entityId, completePayload.fileKey, `/sites/${siteId}/documents`, sha256, `DDS-STORAGE-${entityId.slice(0, 8)}`, userId],
);
console.log('REGISTRY_FIXTURE_INSERTED=true');

const access = await fetch(`${baseUrl}/document-registry/${registryId}/pdf`, { headers });
const accessPayload = await access.json();
console.log(`REGISTRY_ACCESS_STATUS=${access.status}`);
console.log(`REGISTRY_SIGNED_URL_PRESENT=${Boolean(accessPayload.url)}`);
console.log(`REGISTRY_AVAILABILITY=${accessPayload.availability || 'none'}`);
console.log(`REGISTRY_FILE_KEY_PRESENT=${Boolean(accessPayload.fileKey)}`);
if (!accessPayload.url) throw new Error('registry_signed_url_missing');

const emittedUrl = new URL(accessPayload.url, baseUrl);
const reachableUrl = emittedUrl.hostname === '127.0.0.1'
  ? `${baseUrl}${emittedUrl.pathname}${emittedUrl.search}`
  : emittedUrl.toString();
const signed = await fetch(reachableUrl, { headers });
const signedBytes = Buffer.from(await signed.arrayBuffer());
console.log(`REGISTRY_AUTHORIZED_DOWNLOAD=${signed.status}`);
console.log(`REGISTRY_PDF_MAGIC=${signedBytes.subarray(0, 5).toString() === '%PDF-'}`);

const signedUrl = new URL(accessPayload.url, baseUrl);
const anonymous = await fetch(`http://minio-loadtest:9000/sgs-loadtest-dds-test/${completePayload.fileKey}`);
console.log(`REGISTRY_ANONYMOUS_GET=${anonymous.status}`);

const providerExpiryUrl = await getSignedUrl(
  s3,
  new GetObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: completePayload.fileKey,
  }),
  { expiresIn: 5 },
);
const providerExpiryBefore = await fetch(providerExpiryUrl);
await new Promise((resolve) => setTimeout(resolve, 6500));
const providerExpiryAfter = await fetch(providerExpiryUrl);
console.log(`PROVIDER_EXPIRY_BEFORE=${providerExpiryBefore.status}`);
console.log(`PROVIDER_EXPIRY_AFTER=${providerExpiryAfter.status}`);

const tampered = new URL(accessPayload.url, baseUrl);
tampered.pathname = tampered.pathname.slice(0, -1) + (tampered.pathname.endsWith('a') ? 'b' : 'a');
const tamperedReachable = tampered.hostname === '127.0.0.1'
  ? `${baseUrl}${tampered.pathname}${tampered.search}`
  : tampered.toString();
const tamperedResponse = await fetch(tamperedReachable, { headers });
console.log(`REGISTRY_TAMPER=${tamperedResponse.status}`);

const crossTenant = await fetch(`${baseUrl}/document-registry/${registryId}/pdf`, {
  headers: { ...headers, 'x-company-id': otherCompanyId },
});
const crossTenantPayload = await crossTenant.json().catch(() => ({}));
console.log(`REGISTRY_CROSS_TENANT_STATUS=${crossTenant.status}`);
console.log(`REGISTRY_CROSS_TENANT_URL=${Boolean(crossTenantPayload.url)}`);

await db.query('DELETE FROM document_registry WHERE id = $1', [registryId]);
await db.end();
await s3.send(new DeleteObjectCommand({ Bucket: process.env.AWS_BUCKET_NAME, Key: completePayload.fileKey }));
await s3.destroy();
console.log('REGISTRY_FIXTURE_CLEANUP=true');

const assertions = {
  upload: presign.status === 201 && put.status === 200 && complete.status === 201,
  authorized: signed.status === 200 && signedBytes.subarray(0, 5).toString() === '%PDF-',
  anonymous: anonymous.status >= 400,
  providerExpiry: providerExpiryBefore.status === 200 && providerExpiryAfter.status >= 400,
  tamper: tamperedResponse.status >= 400,
  crossTenant: !crossTenantPayload.url && [200, 403, 404].includes(crossTenant.status),
};
for (const [key, value] of Object.entries(assertions)) console.log(`ASSERT_${key.toUpperCase()}=${value ? 'PASS' : 'FAIL'}`);
if (Object.values(assertions).some((value) => !value)) process.exitCode = 6;
