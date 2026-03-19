const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0']);
const HTTP_PROTOCOLS = new Set(['http:', 'https:']);

function readTrimmedValue(envName) {
  const raw = process.env[envName];
  return typeof raw === 'string' ? raw.trim() : '';
}

function parseAbsoluteHttpUrl(rawValue, envName) {
  if (!rawValue) {
    return null;
  }

  let parsed;
  try {
    parsed = new URL(rawValue);
  } catch {
    throw new Error(
      `${envName} deve ser uma URL absoluta válida (ex.: https://api.seu-dominio.com).`,
    );
  }

  if (!HTTP_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(
      `${envName} deve usar protocolo http:// ou https://.`,
    );
  }

  return parsed;
}

function assertDeprecatedFallbacksAreDisabled() {
  const legacyFallbackUrl = readTrimmedValue('NEXT_PUBLIC_API_FALLBACK_URL');
  if (legacyFallbackUrl) {
    throw new Error(
      'NEXT_PUBLIC_API_FALLBACK_URL foi descontinuada por risco de isolamento entre ambientes. Use apenas NEXT_PUBLIC_API_URL explícita.',
    );
  }
}

function assertNotLocalInProtectedMode(parsedUrl, envName) {
  if (!parsedUrl) {
    return;
  }

  if (LOCAL_HOSTNAMES.has(parsedUrl.hostname)) {
    throw new Error(
      `${envName} não pode apontar para localhost/127.0.0.1 em build ou runtime protegidos.`,
    );
  }
}

export function toWebSocketOrigin(parsedUrl) {
  if (!parsedUrl) {
    return null;
  }

  if (parsedUrl.protocol === 'https:') {
    return `wss://${parsedUrl.host}`;
  }

  if (parsedUrl.protocol === 'http:') {
    return `ws://${parsedUrl.host}`;
  }

  return null;
}

export function readFrontendEnvironment(options = {}) {
  const {
    requireExplicitApiUrl = false,
    requireExplicitAppUrl = false,
    disallowLocalUrls = false,
  } = options;

  assertDeprecatedFallbacksAreDisabled();

  const apiUrl = parseAbsoluteHttpUrl(
    readTrimmedValue('NEXT_PUBLIC_API_URL'),
    'NEXT_PUBLIC_API_URL',
  );
  const appUrl = parseAbsoluteHttpUrl(
    readTrimmedValue('NEXT_PUBLIC_APP_URL') ||
      readTrimmedValue('NEXT_PUBLIC_SITE_URL'),
    'NEXT_PUBLIC_APP_URL',
  );

  if (requireExplicitApiUrl && !apiUrl) {
    throw new Error(
      'NEXT_PUBLIC_API_URL é obrigatória para build/start protegidos. Nenhum deploy deve depender de fallback implícito.',
    );
  }

  if (requireExplicitAppUrl && !appUrl) {
    throw new Error(
      'NEXT_PUBLIC_APP_URL é obrigatória para build/start protegidos. Ela define a origem pública usada em links absolutos e validações server-side.',
    );
  }

  if (disallowLocalUrls) {
    assertNotLocalInProtectedMode(apiUrl, 'NEXT_PUBLIC_API_URL');
    assertNotLocalInProtectedMode(appUrl, 'NEXT_PUBLIC_APP_URL');
  }

  return {
    apiUrl,
    apiOrigin: apiUrl?.origin ?? null,
    apiWebSocketOrigin: toWebSocketOrigin(apiUrl),
    appUrl,
    appOrigin: appUrl?.origin ?? null,
  };
}
