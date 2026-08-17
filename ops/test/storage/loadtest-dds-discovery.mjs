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
  const csrfPayload = await csrf.json();
  const cookies = typeof csrf.headers.getSetCookie === 'function'
    ? csrf.headers.getSetCookie()
    : [csrf.headers.get('set-cookie') || ''];
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: cookiePair(cookies),
      'x-csrf-token': String(csrfPayload.csrfToken || ''),
    },
    body: JSON.stringify({
      cpf: process.env.LOADTEST_ADMIN_CPF,
      password: process.env.LOADTEST_ADMIN_PASSWORD,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`login_status=${response.status}`);
  return payload.accessToken || payload.access_token;
}

const token = await login();
const headers = { authorization: `Bearer ${token}` };

async function get(path) {
  return fetch(`${baseUrl}${path}`, { headers });
}

const meResponse = await get('/auth/me');
const me = await meResponse.json();
const companyId = me.company_id || me.companyId || me.user?.company_id;
headers['x-company-id'] = companyId;

const peopleResponse = await get('/dds/people');
const people = await peopleResponse.json().catch(() => ({}));
console.log(`PEOPLE_STATUS=${peopleResponse.status}`);
console.log(`PEOPLE_KEYS=${Object.keys(people).sort().join(',')}`);
for (const [key, value] of Object.entries(people)) {
  if (Array.isArray(value)) console.log(`PEOPLE_${key.toUpperCase()}_COUNT=${value.length}`);
}
if (Array.isArray(people.data) && people.data.length > 0) {
  console.log(`PEOPLE_DATA_KEYS=${Object.keys(people.data[0]).sort().join(',')}`);
}

const ddsResponse = await get('/dds');
const dds = await ddsResponse.json().catch(() => ({}));
console.log(`DDS_LIST_STATUS=${ddsResponse.status}`);
console.log(`DDS_LIST_TYPE=${Array.isArray(dds) ? 'array' : typeof dds}`);
if (Array.isArray(dds)) console.log(`DDS_LIST_COUNT=${dds.length}`);
else if (dds && Array.isArray(dds.data)) console.log(`DDS_LIST_COUNT=${dds.data.length}`);
