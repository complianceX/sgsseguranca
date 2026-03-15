import { ConfigService } from '@nestjs/config';

type RedisConfigReader = ConfigService | NodeJS.ProcessEnv;

export type ResolvedRedisConnection = {
  source: 'url' | 'host';
  url?: string;
  host: string;
  port: number;
  username?: string;
  password?: string;
  tls?: {
    rejectUnauthorized: false;
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
  forceTls = false,
): ResolvedRedisConnection['tls'] {
  const tlsEnabled =
    forceTls || /^true$/i.test(readValue(reader, 'REDIS_TLS') || '');

  return tlsEnabled ? { rejectUnauthorized: false } : undefined;
}

export function isRedisExplicitlyDisabled(reader: RedisConfigReader): boolean {
  return /^true$/i.test(readValue(reader, 'REDIS_DISABLED') || '');
}

export function resolveRedisConnection(
  reader: RedisConfigReader,
): ResolvedRedisConnection | null {
  if (isRedisExplicitlyDisabled(reader)) {
    return null;
  }

  const redisUrl = firstNonEmpty(reader, [
    'REDIS_URL',
    'URL_REDIS',
    'REDIS_PUBLIC_URL',
  ]);

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
      tls: resolveTls(reader, parsed.protocol === 'rediss:'),
    };
  }

  const host = firstNonEmpty(reader, ['REDIS_HOST']);
  if (!host) {
    return null;
  }

  const port = Number(firstNonEmpty(reader, ['REDIS_PORT']) || 6379);

  return {
    source: 'host',
    host,
    port: Number.isFinite(port) && port > 0 ? port : 6379,
    password: firstNonEmpty(reader, ['REDIS_PASSWORD']),
    tls: resolveTls(reader),
  };
}
