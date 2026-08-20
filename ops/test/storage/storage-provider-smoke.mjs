import crypto from 'node:crypto';

const baseUrl = process.env.LOADTEST_API_URL || 'http://api-loadtest:3001';

function cookiePair(setCookies) {
  const values = new Map();
  for (const raw of Array.isArray(setCookies) ? setCookies : [setCookies]) {
    const pair = String(raw || '').split(';', 1)[0];
    const separator = pair.indexOf('=');
    if (separator > 0) values.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
  return [...values.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

async function login() {
  const csrf = await fetch(`${baseUrl}/auth/csrf`);
  const csrfPayload = await csrf.json().catch(() => ({}));
  const csrfCookies = typeof csrf.headers.getSetCookie === 'function'
    ? csrf.headers.getSetCookie()
    : [csrf.headers.get('set-cookie') || ''];
  const csrfCookie = cookiePair(csrfCookies);
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: csrfCookie,
      'x-csrf-token': String(csrfPayload.csrfToken || ''),
    },
    body: JSON.stringify({
      cpf: process.env.LOADTEST_ADMIN_CPF,
      password: process.env.LOADTEST_ADMIN_PASSWORD,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  console.log(`LOGIN_STATUS=${response.status}`);
  if (!response.ok) throw new Error('login_failed');
  return {
    token: payload.accessToken || payload.access_token,
    csrfCookie,
    csrfToken: String(csrfPayload.csrfToken || ''),
  };
}

const auth = await login();
const meResponse = await fetch(`${baseUrl}/auth/me`, {
  headers: { authorization: `Bearer ${auth.token}` },
});
const me = await meResponse.json().catch(() => ({}));
const companyId = me.company_id || me.companyId || me.user?.company_id;
if (!companyId) throw new Error('company_context_missing');

const headers = {
  authorization: `Bearer ${auth.token}`,
  'x-company-id': companyId,
  cookie: auth.csrfCookie,
  'x-csrf-token': auth.csrfToken,
};

const pdf = Buffer.from(
  `%PDF-1.4\n% synthetic storage provider test\n${'x'.repeat(180)}\n%%EOF\n`,
  'utf8',
);
const sha256 = crypto.createHash('sha256').update(pdf).digest('hex');

// Este smoke prova somente a esteira do provider. O anexo de PDF de DDS exige
// aprovação prévia e é coberto pelo teste de ciclo DDS, não por este teste de
// storage. O harness nunca contorna uma regra de negócio legítima.
const presign = await fetch(`${baseUrl}/storage/presigned-url`, {
  method: 'POST',
  headers: { ...headers, 'content-type': 'application/json' },
  body: JSON.stringify({
    filename: 'storage-provider-official.pdf',
    contentType: 'application/pdf',
  }),
});
const presignPayload = await presign.json().catch(() => ({}));
console.log(`PRESIGNED_STATUS=${presign.status}`);
console.log(`PRESIGNED_URL_PRESENT=${Boolean(presignPayload.uploadUrl)}`);
if (!presign.ok || !presignPayload.uploadUrl) throw new Error('presign_failed');

const uploadUrl = new URL(presignPayload.uploadUrl);
console.log(`PRESIGNED_HOST=${uploadUrl.host}`);
console.log(`PRESIGNED_PATH_HAS_BUCKET=${uploadUrl.pathname.includes('sgs-loadtest-dds-test')}`);

const put = await fetch(presignPayload.uploadUrl, {
  method: 'PUT',
  headers: { 'content-type': 'application/pdf' },
  body: pdf,
});
console.log(`PROVIDER_PUT_STATUS=${put.status}`);
if (!put.ok) throw new Error('provider_put_failed');

const complete = await fetch(`${baseUrl}/storage/complete-upload`, {
  method: 'POST',
  headers: { ...headers, 'content-type': 'application/json' },
  body: JSON.stringify({
    fileKey: presignPayload.fileKey,
    originalFilename: 'storage-provider-official.pdf',
    sha256,
  }),
});
const completePayload = await complete.json().catch(() => ({}));
console.log(`COMPLETE_STATUS=${complete.status}`);
console.log(`PROMOTED_KEY_PRESENT=${Boolean(completePayload.fileKey)}`);
console.log(`SHA256_VERIFIED=${completePayload.sha256Verified === true}`);
console.log(`PROMOTED_DOCUMENTS_NAMESPACE=${String(completePayload.fileKey || '').startsWith('documents/')}`);
if (!complete.ok) throw new Error('complete_upload_failed');

const directPath = `/${String(completePayload.fileKey || '').replace(/^\/+/, '')}`;
const anonymousList = await fetch('http://minio-loadtest:9000/sgs-loadtest-dds-test?list-type=2');
console.log(`ANONYMOUS_LIST=${anonymousList.status}`);
const anonymousGet = await fetch(`http://minio-loadtest:9000${directPath}`);
console.log(`ANONYMOUS_GET=${anonymousGet.status}`);

const tampered = new URL(presignPayload.uploadUrl);
tampered.searchParams.set('X-Amz-Signature', '0'.repeat(64));
const tamperedResponse = await fetch(tampered);
console.log(`SIGNED_URL_TAMPER=${tamperedResponse.status}`);

const expected = {
  PRESIGNED_HOST: uploadUrl.hostname === 'minio-loadtest',
  PRESIGNED_PATH_HAS_BUCKET: uploadUrl.pathname.includes('sgs-loadtest-dds-test'),
  PROVIDER_PUT: put.status === 200,
  PROMOTED_KEY: String(completePayload.fileKey || '').startsWith('documents/'),
  SHA256_VERIFIED: completePayload.sha256Verified === true,
  ANONYMOUS_LIST: anonymousList.status >= 400,
  ANONYMOUS_GET: anonymousGet.status >= 400,
  SIGNED_URL_TAMPER: tamperedResponse.status >= 400,
};
for (const [key, value] of Object.entries(expected)) {
  console.log(`${key}_ASSERTION=${value ? 'PASS' : 'FAIL'}`);
}
if (Object.values(expected).some((value) => !value)) process.exitCode = 5;
