const baseUrl = process.env.LOADTEST_API_URL || 'http://api-loadtest:3001';

function cookiePair(setCookies) {
  const values = new Map();
  for (const raw of Array.isArray(setCookies) ? setCookies : [setCookies]) {
    const pair = String(raw || '').split(';', 1)[0];
    const separator = pair.indexOf('=');
    if (separator > 0) {
      values.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  }
  return [...values.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

const csrfResponse = await fetch(`${baseUrl}/auth/csrf`);
const csrfPayload = await csrfResponse.json().catch(() => ({}));
console.log(`CSRF_STATUS=${csrfResponse.status}`);
const csrfSetCookies =
  typeof csrfResponse.headers.getSetCookie === 'function'
    ? csrfResponse.headers.getSetCookie()
    : [csrfResponse.headers.get('set-cookie') || csrfResponse.headers.get('set-cookie2')];
const csrfCookie = cookiePair(csrfSetCookies);
console.log(`CSRF_TOKEN_PRESENT=${Boolean(csrfPayload.csrfToken)}`);
console.log(`CSRF_COOKIE_PRESENT=${Boolean(csrfCookie)}`);

const loginResponse = await fetch(`${baseUrl}/auth/login`, {
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
const loginPayload = await loginResponse.json().catch(() => ({}));
console.log(`LOGIN_STATUS=${loginResponse.status}`);
if (!loginResponse.ok) process.exit(2);

const token = loginPayload.accessToken || loginPayload.access_token;
if (!token) {
  console.log('LOGIN_TOKEN_PRESENT=false');
  process.exit(3);
}
console.log('LOGIN_TOKEN_PRESENT=true');

const meResponse = await fetch(`${baseUrl}/auth/me`, {
  headers: { authorization: `Bearer ${token}` },
});
console.log(`ME_STATUS=${meResponse.status}`);
if (!meResponse.ok) process.exit(4);
const me = await meResponse.json();
console.log(`COMPANY_ID_PRESENT=${Boolean(me.company_id || me.companyId || me.user?.company_id)}`);
console.log(`USER_ID_PRESENT=${Boolean(me.id || me.user?.id || me.user?.userId)}`);
