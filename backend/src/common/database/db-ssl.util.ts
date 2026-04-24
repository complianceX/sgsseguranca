type DbSslOptions = false | { rejectUnauthorized: boolean; ca?: string };

type ResolveDbSslInput = {
  isProduction: boolean;
  sslEnabled: boolean;
  sslCA?: string | null;
  allowInsecure: boolean;
};

export function parseBooleanFlag(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return /^true$/i.test(value.trim());
  }
  return false;
}

export function resolveDatabaseHostname(input: {
  url?: string | null;
  host?: string | null;
}): string {
  if (typeof input.url === 'string' && input.url.trim().length > 0) {
    try {
      return new URL(input.url).hostname;
    } catch {
      // noop
    }
  }

  return typeof input.host === 'string' ? input.host.trim() : '';
}

export function isSupabaseHost(hostname: string | null | undefined): boolean {
  if (typeof hostname !== 'string') {
    return false;
  }

  const normalized = hostname.toLowerCase();
  return (
    normalized.includes('supabase.co') ||
    normalized.includes('pooler.supabase.com') ||
    normalized.includes('.supabase.')
  );
}

export function isNeonPoolerHost(hostname: string | null | undefined): boolean {
  if (typeof hostname !== 'string') {
    return false;
  }

  const normalized = hostname.toLowerCase();
  return normalized.endsWith('.neon.tech') && normalized.includes('-pooler.');
}

export function isTlsCertificateError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : typeof error === 'string'
        ? error.toLowerCase()
        : '';

  return (
    message.includes('self-signed certificate') ||
    message.includes('certificate has expired') ||
    message.includes('certificate chain') ||
    message.includes('unable to verify')
  );
}

export function resolveDbSslOptions(input: ResolveDbSslInput): DbSslOptions {
  const sslCA = input.sslCA?.trim();

  if (!input.isProduction) {
    if (!input.sslEnabled && !input.allowInsecure) {
      return false;
    }
    if (input.allowInsecure) {
      return { rejectUnauthorized: false };
    }
    if (sslCA) {
      return { rejectUnauthorized: true, ca: sslCA };
    }
    return { rejectUnauthorized: true };
  }

  if (input.allowInsecure) {
    return { rejectUnauthorized: false };
  }

  if (!input.sslEnabled) {
    throw new Error(
      'DATABASE_SSL=true é obrigatório em produção (ou use DATABASE_SSL_ALLOW_INSECURE=true com risco explícito).',
    );
  }

  if (sslCA) {
    return { rejectUnauthorized: true, ca: sslCA };
  }

  return { rejectUnauthorized: true };
}
