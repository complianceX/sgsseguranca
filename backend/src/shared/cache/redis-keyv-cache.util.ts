import { createKeyv } from '@keyv/redis';
import type { Keyv } from 'keyv';
import {
  assertSecureRedisConnection,
  type ResolvedRedisConnection,
} from '../redis/redis-connection.util';

export const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

export function buildRedisKeyvUrl(connection: ResolvedRedisConnection): string {
  const protocol = connection.tls ? 'rediss:' : 'redis:';

  if (connection.url) {
    const parsed = new URL(connection.url);
    parsed.protocol = protocol;
    if (connection.username) {
      parsed.username = connection.username;
    }
    if (connection.password) {
      parsed.password = connection.password;
    }
    return parsed.toString();
  }

  const urlHost =
    connection.host.includes(':') && !connection.host.startsWith('[')
      ? `[${connection.host}]`
      : connection.host;
  const parsed = new URL(`${protocol}//${urlHost}`);
  parsed.port = String(connection.port);
  if (connection.username) {
    parsed.username = connection.username;
  }
  if (connection.password) {
    parsed.password = connection.password;
  }
  return parsed.toString();
}

export function createRedisKeyvCache(
  connection: ResolvedRedisConnection,
): Keyv {
  assertSecureRedisConnection(connection);

  return createKeyv(buildRedisKeyvUrl(connection), {
    connectionTimeout: 10_000,
    throwOnConnectError: true,
    throwOnErrors: true,
    useUnlink: true,
    noNamespaceAffectsAll: false,
  });
}
