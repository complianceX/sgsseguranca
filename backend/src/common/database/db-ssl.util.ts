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
