import { ConfigService } from '@nestjs/config';

type RedisConfigReader = ConfigService | NodeJS.ProcessEnv;
export type RedisConnectionTier = 'auth' | 'cache' | 'queue';

export type ResolvedRedisConnection = {
  source: 'url' | 'host';
  url?: string;
  host: string;
  port: number;
  username?: string;
  password?: string;
  tls?: {
    rejectUnauthorized: boolean;
  };
};

function readValue(reader: RedisConfigReader, key: string): string | undefined {
  if (reader instanceof ConfigService) {
    return reader.get<string>(key) ?? undefined;
  }

  return reader[key];
}

function firstNonEmpty(
  reader: RedisConfigReader,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = readValue(reader, key);
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function resolveTls(
  reader: RedisConfigReader,
  tier: RedisConnectionTier | undefined,
  forceTls = false,
): ResolvedRedisConnection['tls'] {
  const prefix = tier ? `REDIS_${tier.toUpperCase()}_` : 'REDIS_';
  const tlsEnabled =
    forceTls ||
    /^true$/i.test(
      firstNonEmpty(reader, [
        `${prefix}TLS`,
        'REDIS_TLS',
      ]) || '',
    );

  if (!tlsEnabled) return undefined;

  const allowInsecure = /^true$/i.test(
    firstNonEmpty(reader, [
      `${prefix}TLS_ALLOW_INSECURE`,
      'REDIS_TLS_ALLOW_INSECURE',
    ]) || '',
  );
  return { rejectUnauthorized: !allowInsecure };
}

export function isRedisExplicitlyDisabled(reader: RedisConfigReader): boolean {
  return /^true$/i.test(readValue(reader, 'REDIS_DISABLED') || '');
}

export function resolveRedisConnection(
  reader: RedisConfigReader,
  tier?: RedisConnectionTier,
): ResolvedRedisConnection | null {
  if (isRedisExplicitlyDisabled(reader)) {
    return null;
  }

  const prefix = tier ? `REDIS_${tier.toUpperCase()}_` : undefined;
  const redisUrl = firstNonEmpty(
    reader,
    prefix
      ? [`${prefix}URL`, 'REDIS_URL', 'URL_REDIS', 'REDIS_PUBLIC_URL']
      : ['REDIS_URL', 'URL_REDIS', 'REDIS_PUBLIC_URL'],
  );

  if (redisUrl) {
    const parsed = new URL(redisUrl);
    return {
      source: 'url',
      url: redisUrl,
      host: parsed.hostname,
      port: Number(parsed.port || 6379),
      username: parsed.username
        ? decodeURIComponent(parsed.username)
        : undefined,
      password: parsed.password
        ? decodeURIComponent(parsed.password)
        : undefined,
      tls: resolveTls(reader, tier, parsed.protocol === 'rediss:'),
    };
  }

  const host = firstNonEmpty(
    reader,
    prefix ? [`${prefix}HOST`, 'REDIS_HOST'] : ['REDIS_HOST'],
  );
  if (!host) {
    return null;
  }

  const port = Number(
    firstNonEmpty(
      reader,
      prefix ? [`${prefix}PORT`, 'REDIS_PORT'] : ['REDIS_PORT'],
    ) || 6379,
  );

  return {
    source: 'host',
    host,
    port: Number.isFinite(port) && port > 0 ? port : 6379,
    username: firstNonEmpty(
      reader,
      prefix ? [`${prefix}USERNAME`, 'REDIS_USERNAME'] : ['REDIS_USERNAME'],
    ),
    password: firstNonEmpty(
      reader,
      prefix ? [`${prefix}PASSWORD`, 'REDIS_PASSWORD'] : ['REDIS_PASSWORD'],
    ),
    tls: resolveTls(reader, tier),
  };
}
