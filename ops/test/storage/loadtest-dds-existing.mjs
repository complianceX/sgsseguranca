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

const listResponse = await fetch(`${baseUrl}/dds`, { headers });
const listPayload = await listResponse.json();
const items = Array.isArray(listPayload) ? listPayload : listPayload.data || [];
console.log(`DDS_LIST_STATUS=${listResponse.status}`);
console.log(`DDS_COUNT=${items.length}`);

let ready = 0;
let cleaned = 0;
for (const item of items) {
  if (!item?.id) continue;
  const detailResponse = await fetch(`${baseUrl}/dds/${item.id}`, { headers });
  const detail = await detailResponse.json().catch(() => ({}));
  const topic = String(detail.tema || detail.title || '');
  if (topic.startsWith('Storage provider test ')) {
    const deleteResponse = await fetch(`${baseUrl}/dds/${item.id}`, {
      method: 'DELETE',
      headers,
    });
    if ([200, 204].includes(deleteResponse.status)) cleaned += 1;
  }
  const accessResponse = await fetch(`${baseUrl}/dds/${item.id}/pdf`, { headers });
  const access = await accessResponse.json().catch(() => ({}));
  if (accessResponse.ok && access.url) ready += 1;
}
console.log(`GOVERNED_PDF_READY_COUNT=${ready}`);
console.log(`ORPHAN_SYNTHETIC_DDS_CLEANED=${cleaned}`);
