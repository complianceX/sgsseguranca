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
const token = loginPayload.accessToken || loginPayload.access_token;
const me = await (await fetch(`${baseUrl}/auth/me`, {
  headers: { authorization: `Bearer ${token}` },
})).json();
const companyId = me.company_id || me.companyId || me.user?.company_id;
const headers = {
  authorization: `Bearer ${token}`,
  'x-company-id': companyId,
  cookie: csrfCookie,
  'x-csrf-token': csrfPayload.csrfToken,
};

const pdf = Buffer.from(
  `%PDF-1.4\n% synthetic storage provider test\n${'x'.repeat(180)}\n%%EOF\n`,
  'utf8',
);
const sha256 = crypto.createHash('sha256').update(pdf).digest('hex');
const presign = await fetch(`${baseUrl}/storage/presigned-url`, {
  method: 'POST',
  headers: { ...headers, 'content-type': 'application/json' },
  body: JSON.stringify({ filename: 'storage-provider-official.pdf', contentType: 'application/pdf' }),
});
const presignPayload = await presign.json().catch(() => ({}));
console.log(`PRESIGNED_STATUS=${presign.status}`);
console.log(`PRESIGNED_URL_PRESENT=${Boolean(presignPayload.uploadUrl)}`);
if (!presign.ok || !presignPayload.uploadUrl) process.exit(2);
const uploadUrl = new URL(presignPayload.uploadUrl);
console.log(`PRESIGNED_HOST=${uploadUrl.host}`);
console.log(`PRESIGNED_PATH_HAS_BUCKET=${uploadUrl.pathname.includes('sgs-loadtest-dds-test')}`);

const put = await fetch(presignPayload.uploadUrl, {
  method: 'PUT',
  headers: { 'content-type': 'application/pdf' },
  body: pdf,
});
console.log(`PROVIDER_PUT_STATUS=${put.status}`);
if (!put.ok) {
  const errorBody = await put.text();
  const errorCode = errorBody.match(/<Code>([^<]+)/)?.[1] || 'unknown';
  console.log(`PROVIDER_PUT_ERROR_CODE=${errorCode}`);
}
if (!put.ok) process.exit(3);

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
if (!complete.ok) process.exit(4);

const anonymousObject = await fetch(`http://minio-loadtest:9000/sgs-loadtest-dds-test/${completePayload.fileKey}`);
console.log(`ANONYMOUS_PROMOTED_GET=${anonymousObject.status}`);
console.log(`APPLICATION_UPLOAD_FLOW=${complete.ok && completePayload.sha256Verified === true ? 'PASS' : 'FAIL'}`);
