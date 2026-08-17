import crypto from 'node:crypto';

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

async function login() {
  const csrf = await fetch(`${baseUrl}/auth/csrf`);
  const csrfPayload = await csrf.json();
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
const me = await meResponse.json();
const companyId = me.company_id || me.companyId || me.user?.company_id;
if (!companyId) throw new Error('company_context_missing');

function apiHeaders(extra = {}, company = companyId) {
  return {
    authorization: `Bearer ${auth.token}`,
    'x-company-id': company,
    cookie: auth.csrfCookie,
    'x-csrf-token': auth.csrfToken,
    ...extra,
  };
}

async function api(path, options = {}, company = companyId) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: apiHeaders(options.headers || {}, company),
  });
}

const peopleResponse = await api('/dds/people', { method: 'GET' });
const people = await peopleResponse.json();
const peopleData = Array.isArray(people.data) ? people.data : [];
const facilitator = peopleData.find((person) => person.status !== 'inativo') || peopleData[0];
if (!facilitator?.id || !facilitator?.site_id) throw new Error('synthetic_people_fixture_missing');

const createResponse = await api('/dds', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    tema: `Storage provider test ${new Date().toISOString()}`,
    conteudo: 'Registro sintético de integração S3-compatible.',
    data: new Date().toISOString().slice(0, 10),
    site_id: facilitator.site_id,
    facilitador_id: facilitator.id,
    participants: [],
  }),
});
const created = await createResponse.json().catch(() => ({}));
console.log(`DDS_CREATE_STATUS=${createResponse.status}`);
if (!createResponse.ok || !created.id) throw new Error('dds_create_failed');
const ddsId = created.id;
console.log('DDS_SYNTHETIC_CREATED=true');

const pdf = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<<>>\n%%EOF\n',
  'utf8',
);
const form = new FormData();
form.append('file', new Blob([pdf], { type: 'application/pdf' }), 'storage-provider-test.pdf');
const attachResponse = await api(`/dds/${ddsId}/file`, { method: 'POST', body: form });
console.log(`DDS_PDF_ATTACH_STATUS=${attachResponse.status}`);
if (!attachResponse.ok) throw new Error('dds_pdf_attach_failed');

const accessResponse = await api(`/dds/${ddsId}/pdf`, { method: 'GET' });
const access = await accessResponse.json().catch(() => ({}));
console.log(`DDS_PDF_ACCESS_STATUS=${accessResponse.status}`);
console.log(`SIGNED_URL_PRESENT=${Boolean(access.url)}`);
if (!access.url) throw new Error('signed_url_missing');

const signedUrl = new URL(access.url);
const directPath = signedUrl.pathname;
const signedDownload = await fetch(access.url);
console.log(`AUTHORIZED_PROVIDER_DOWNLOAD=${signedDownload.status}`);
const signedBytes = Buffer.from(await signedDownload.arrayBuffer());
console.log(`AUTHORIZED_PDF_MAGIC=${signedBytes.subarray(0, 5).toString() === '%PDF-'}`);

const anonymousList = await fetch('http://minio-loadtest:9000/sgs-loadtest-dds-test?list-type=2');
console.log(`ANONYMOUS_LIST=${anonymousList.status}`);
const anonymousGet = await fetch(`http://minio-loadtest:9000${directPath}`);
console.log(`ANONYMOUS_GET=${anonymousGet.status}`);

const tampered = new URL(access.url);
tampered.searchParams.set('X-Amz-Signature', '0'.repeat(64));
const tamperedResponse = await fetch(tampered);
console.log(`SIGNED_URL_TAMPER=${tamperedResponse.status}`);

const crossTenant = await api(`/dds/${ddsId}/pdf`, { method: 'GET' }, otherCompanyId);
console.log(`CROSS_TENANT_DDS_PDF=${crossTenant.status}`);

const idor = await api('/dds/00000000-0000-4000-8000-000000000098/pdf', { method: 'GET' });
console.log(`DDS_IDOR=${idor.status}`);

await new Promise((resolve) => setTimeout(resolve, 6500));
const expired = await fetch(access.url);
console.log(`SIGNED_URL_AFTER_TTL=${expired.status}`);

const deleteResponse = await api(`/dds/${ddsId}`, { method: 'DELETE' });
console.log(`SYNTHETIC_DDS_CLEANUP=${deleteResponse.status}`);

const expected = {
  AUTHORIZED_PROVIDER_DOWNLOAD: signedDownload.status === 200 && signedBytes.subarray(0, 5).toString() === '%PDF-',
  ANONYMOUS_LIST: anonymousList.status >= 400,
  ANONYMOUS_GET: anonymousGet.status >= 400,
  SIGNED_URL_TAMPER: tamperedResponse.status >= 400,
  CROSS_TENANT_DDS_PDF: [403, 404].includes(crossTenant.status),
  DDS_IDOR: [403, 404].includes(idor.status),
  SIGNED_URL_AFTER_TTL: expired.status >= 400,
  SYNTHETIC_DDS_CLEANUP: [200, 204].includes(deleteResponse.status),
};
for (const [key, value] of Object.entries(expected)) console.log(`${key}_ASSERTION=${value ? 'PASS' : 'FAIL'}`);
if (Object.values(expected).some((value) => !value)) process.exitCode = 5;
