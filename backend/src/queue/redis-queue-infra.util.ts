import { isLocalRedisConnection, isRedisExplicitlyDisabled, resolveRedisConnection } from '../common/redis/redis-connection.util';

export function shouldUseRedisQueueInfra(
  reader: NodeJS.ProcessEnv = process.env,
): boolean {
  if (isRedisExplicitlyDisabled(reader)) {
    return false;
  }

  if (reader.NODE_ENV === 'production') {
    return true;
  }

  const queueConnection = resolveRedisConnection(reader, 'queue');
  if (!queueConnection) {
    return false;
  }

  const failOpenRequested = /^true$/i.test(
    reader.REDIS_FAIL_OPEN || 'true',
  );

  return !failOpenRequested || !isLocalRedisConnection(queueConnection);
}
