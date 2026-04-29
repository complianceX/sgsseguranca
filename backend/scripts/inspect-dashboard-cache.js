const path = require('path');
const dotenv = require('dotenv');
const Redis = require('ioredis');
const { connectRuntimePgClient } = require('./lib/pg-runtime-client');

const QUERY_TYPES = ['summary', 'kpis', 'pending-queue'];

function parseCliArgs(argv) {
  const options = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const arg = token.slice(2);
    const equalIndex = arg.indexOf('=');
    if (equalIndex === -1) {
      options[arg] = true;
      continue;
    }
    options[arg.slice(0, equalIndex)] = arg.slice(equalIndex + 1);
  }
  return options;
}

function buildDashboardCacheKey(companyId, queryType) {
  return `dashboard:${companyId}:${queryType}`;
}

function buildDashboardStaleCacheKey(companyId, queryType) {
  return `${buildDashboardCacheKey(companyId, queryType)}:stale`;
}

function safeJsonParse(raw) {
  if (typeof raw !== 'string' || raw.length === 0) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function parseBooleanFlag(value) {
  return typeof value === 'string' && /^true$/i.test(value.trim());
}

function resolveRedisConnectionFromEnv(env) {
  if (parseBooleanFlag(env.REDIS_DISABLED)) {
    return null;
  }

  const redisUrl = firstNonEmpty(
    env.REDIS_URL,
    env.URL_REDIS,
    env.REDIS_PUBLIC_URL,
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
      tls:
        parsed.protocol === 'rediss:' || parseBooleanFlag(env.REDIS_TLS)
          ? {
              rejectUnauthorized: !parseBooleanFlag(
                env.REDIS_TLS_ALLOW_INSECURE,
              ),
            }
          : undefined,
    };
  }

  const host = firstNonEmpty(env.REDIS_HOST);
  if (!host) {
    return null;
  }

  return {
    source: 'host',
    host,
    port: Number(firstNonEmpty(env.REDIS_PORT) || 6379),
    username: firstNonEmpty(env.REDIS_USERNAME),
    password: firstNonEmpty(env.REDIS_PASSWORD),
    tls: parseBooleanFlag(env.REDIS_TLS)
      ? {
          rejectUnauthorized: !parseBooleanFlag(env.REDIS_TLS_ALLOW_INSECURE),
        }
      : undefined,
  };
}

async function inspectRedis(companyId) {
  const redisConnection = resolveRedisConnectionFromEnv(process.env);
  if (!redisConnection) {
    throw new Error('Redis não configurado no runtime.');
  }

  const redis = redisConnection.url
    ? new Redis(redisConnection.url, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      })
    : new Redis({
        host: redisConnection.host,
        port: redisConnection.port,
        username: redisConnection.username,
        password: redisConnection.password,
        tls: redisConnection.tls,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });

  await redis.connect();
  try {
    const queries = [];
    for (const queryType of QUERY_TYPES) {
      const activeKey = buildDashboardCacheKey(companyId, queryType);
      const staleKey = buildDashboardStaleCacheKey(companyId, queryType);
      const [
        activeExists,
        activeTtl,
        activeRaw,
        staleExists,
        staleTtl,
        staleRaw,
      ] = await Promise.all([
        redis.exists(activeKey),
        redis.pttl(activeKey),
        redis.get(activeKey),
        redis.exists(staleKey),
        redis.pttl(staleKey),
        redis.get(staleKey),
      ]);

      const activeParsed = safeJsonParse(activeRaw);
      const staleParsed = safeJsonParse(staleRaw);

      queries.push({
        queryType,
        active: {
          key: activeKey,
          exists: activeExists === 1,
          pttlMs: activeTtl,
          generatedAt:
            typeof activeParsed?.generatedAt === 'number'
              ? new Date(activeParsed.generatedAt).toISOString()
              : null,
          payloadSizeBytes:
            typeof activeRaw === 'string'
              ? Buffer.byteLength(activeRaw, 'utf8')
              : 0,
        },
        stale: {
          key: staleKey,
          exists: staleExists === 1,
          pttlMs: staleTtl,
          generatedAt:
            typeof staleParsed?.generatedAt === 'number'
              ? new Date(staleParsed.generatedAt).toISOString()
              : null,
          payloadSizeBytes:
            typeof staleRaw === 'string'
              ? Buffer.byteLength(staleRaw, 'utf8')
              : 0,
        },
      });
    }

    return {
      connection: {
        source: redisConnection.source,
        host: redisConnection.host,
        port: redisConnection.port,
        tls: Boolean(redisConnection.tls),
      },
      queries,
    };
  } finally {
    await redis.quit();
  }
}

async function inspectSnapshots(companyId) {
  const { client, warnings, usedInsecureFallback } =
    await connectRuntimePgClient();
  try {
    await client.query(
      `SELECT set_config('app.current_company_id', $1, false), set_config('app.current_company', $1, false), set_config('app.is_super_admin', 'false', false)`,
      [companyId],
    );
    const result = await client.query(
      `SELECT company_id, query_type, generated_at, expires_at, schema_version, last_error
         FROM public.dashboard_query_snapshots
        WHERE company_id = $1
        ORDER BY query_type`,
      [companyId],
    );

    return {
      warnings,
      usedInsecureFallback,
      rows: result.rows,
    };
  } finally {
    await client.end();
  }
}

async function main() {
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });

  const args = parseCliArgs(process.argv.slice(2));
  const companyId = String(args['company-id'] || '').trim();

  if (!companyId) {
    throw new Error('Informe --company-id=<uuid>.');
  }

  const [redis, snapshots] = await Promise.all([
    inspectRedis(companyId),
    inspectSnapshots(companyId),
  ]);

  console.log(
    JSON.stringify(
      {
        companyId,
        inspectedAt: new Date().toISOString(),
        redis,
        snapshots,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
