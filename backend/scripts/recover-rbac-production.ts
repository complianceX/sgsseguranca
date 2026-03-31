import 'reflect-metadata';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { Client } from 'pg';
import Redis from 'ioredis';
import { PROFILE_PERMISSION_FALLBACK } from '../src/rbac/rbac.service';
import { resolveRedisConnection } from '../src/common/redis/redis-connection.util';
import {
  ensureDir,
  getStringArg,
  hasFlag,
  parseCliArgs,
  resolveDatabaseRuntimeConfig,
  writeJsonFile,
} from './disaster-recovery/common';

type ProfileRow = {
  id: string;
  nome: string;
  permissoes: unknown;
};

type RoleRow = {
  id: string;
  name: string;
};

type PermissionRow = {
  id: string;
  name: string;
};

type UserRoleGapRow = {
  user_id: string;
  profile_name: string;
  role_name: string;
};

type ProfileWithoutRoleRow = {
  profile_name: string;
  users_count: string | number;
};

type RolePermissionPair = {
  roleName: string;
  permissionName: string;
};

type ProfileRepairPlan = {
  profileId: string;
  profileName: string;
  previousPermissoes: unknown;
  nextPermissoes: string[];
};

type UserRoleDiagnostics = {
  expectedLinks: number;
  missingLinks: number;
  missingLinksSample: UserRoleGapRow[];
  profilesWithoutRole: Array<{
    profileName: string;
    usersCount: number;
  }>;
};

type RedisInvalidationReport = {
  attempted: boolean;
  skippedReason: string | null;
  deleted: {
    rbacAccess: number;
    refresh: number;
    refreshSet: number;
    consumed: number;
  };
  warnings: string[];
};

type RecoveryReport = {
  version: 1;
  type: 'rbac_production_recovery';
  mode: 'dry_run' | 'apply';
  status: 'dry_run' | 'success' | 'failed';
  startedAt: string;
  completedAt: string | null;
  reportFile: string;
  assumptions: {
    sourceOfTruth: string;
    fillOnlyMissing: true;
    forceSessionRenewal: boolean;
    databaseTarget: string;
  };
  summary: {
    profilesTotal: number;
    profilesWithFallback: number;
    profilesInvalidBefore: number;
    profilesUpdated: number;
    rolesMissingBefore: number;
    rolesCreated: number;
    permissionsMissingBefore: number;
    permissionsCreated: number;
    rolePermissionsBefore: number;
    rolePermissionsMissingBefore: number;
    rolePermissionsInserted: number;
    rolePermissionsAfter: number;
    userRolesBefore: number;
    userRoleLinksExpectedBefore: number;
    userRoleLinksMissingBefore: number;
    userRolesInserted: number;
    userRolesAfter: number;
    userRoleLinksMissingAfter: number;
    redisRbacKeysDeleted: number;
    redisSessionKeysDeleted: number;
  };
  details: {
    profileRepairsPlanned: ProfileRepairPlan[];
    profileRepairsApplied: string[];
    rolesMissingBefore: string[];
    permissionsMissingBefore: string[];
    rolePermissionsMissingBefore: RolePermissionPair[];
    userRoleMissingBeforeSample: UserRoleGapRow[];
    profilesWithoutRoleBefore: Array<{
      profileName: string;
      usersCount: number;
    }>;
    profilesWithoutRoleAfter: Array<{
      profileName: string;
      usersCount: number;
    }>;
  };
  redisInvalidation: RedisInvalidationReport;
  warnings: string[];
  errors: string[];
};

const PROFILE_FALLBACK_ENTRIES = Object.entries(PROFILE_PERMISSION_FALLBACK).map(
  ([profileName, permissions]) => ({
    profileName,
    permissions: uniqueStringsInOrder(permissions),
  }),
);

function createTimestampLabel(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function stripSslModeFromConnectionString(connectionString: string): string {
  try {
    const parsed = new URL(connectionString);
    parsed.searchParams.delete('sslmode');
    return parsed.toString();
  } catch {
    return connectionString;
  }
}

function toInt(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : 0;
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function uniqueStringsInOrder(values: unknown[]): string[] {
  const dedup = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }
    const candidate = value.trim();
    if (!candidate || dedup.has(candidate)) {
      continue;
    }
    dedup.add(candidate);
    normalized.push(candidate);
  }
  return normalized;
}

function isProfilePermissionPayloadInvalid(payload: unknown): boolean {
  if (!Array.isArray(payload)) {
    return true;
  }
  return uniqueStringsInOrder(payload).length === 0;
}

function previewJson(value: unknown, maxLength = 160): string {
  try {
    const serialized = JSON.stringify(value);
    if (!serialized) {
      return String(value);
    }
    return serialized.length > maxLength
      ? `${serialized.slice(0, maxLength)}...`
      : serialized;
  } catch {
    return String(value);
  }
}

function buildDesiredRolePermissionPairs(): RolePermissionPair[] {
  const seen = new Set<string>();
  const pairs: RolePermissionPair[] = [];

  for (const entry of PROFILE_FALLBACK_ENTRIES) {
    for (const permissionName of entry.permissions) {
      const key = `${entry.profileName}::${permissionName}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      pairs.push({
        roleName: entry.profileName,
        permissionName,
      });
    }
  }

  return pairs;
}

function buildPgSslConfig(databaseUrl?: string):
  | false
  | {
      rejectUnauthorized: boolean;
    } {
  const runtimeUrl = databaseUrl || process.env.DATABASE_URL || '';
  const sslRequiredByUrl = /(?:\?|&)sslmode=require(?:&|$)/i.test(runtimeUrl);
  const sslEnabled =
    sslRequiredByUrl || /^true$/i.test(process.env.DATABASE_SSL || '');

  if (!sslEnabled) {
    return false;
  }

  const allowInsecure = /^true$/i.test(
    process.env.DATABASE_SSL_ALLOW_INSECURE || '',
  );
  return {
    rejectUnauthorized: !allowInsecure,
  };
}

function chunkArray<T>(source: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < source.length; index += chunkSize) {
    chunks.push(source.slice(index, index + chunkSize));
  }
  return chunks;
}

async function fetchProfiles(client: Client): Promise<ProfileRow[]> {
  const result = await client.query<ProfileRow>(
    `SELECT id, nome, permissoes
     FROM public.profiles
     ORDER BY nome ASC`,
  );
  return result.rows;
}

async function fetchRoles(client: Client): Promise<RoleRow[]> {
  const result = await client.query<RoleRow>(
    `SELECT id, name
     FROM public.roles
     ORDER BY name ASC`,
  );
  return result.rows;
}

async function fetchPermissions(client: Client): Promise<PermissionRow[]> {
  const result = await client.query<PermissionRow>(
    `SELECT id, name
     FROM public.permissions
     ORDER BY name ASC`,
  );
  return result.rows;
}

async function fetchUserRoleDiagnostics(
  client: Client,
  sampleLimit: number,
): Promise<UserRoleDiagnostics> {
  const expectedLinksResult = await client.query<{ count: string }>(
    `SELECT COUNT(*)::bigint AS count
     FROM public.users u
     JOIN public.profiles p ON p.id = u.profile_id
     JOIN public.roles r ON r.name = p.nome
     WHERE u.deleted_at IS NULL`,
  );
  const expectedLinks = toInt(expectedLinksResult.rows[0]?.count);

  const missingLinksResult = await client.query<{ count: string }>(
    `SELECT COUNT(*)::bigint AS count
     FROM public.users u
     JOIN public.profiles p ON p.id = u.profile_id
     JOIN public.roles r ON r.name = p.nome
     LEFT JOIN public.user_roles ur
       ON ur.user_id = u.id
      AND ur.role_id = r.id
     WHERE u.deleted_at IS NULL
       AND ur.user_id IS NULL`,
  );
  const missingLinks = toInt(missingLinksResult.rows[0]?.count);

  const missingLinksSampleResult = await client.query<UserRoleGapRow>(
    `SELECT
       u.id AS user_id,
       p.nome AS profile_name,
       r.name AS role_name
     FROM public.users u
     JOIN public.profiles p ON p.id = u.profile_id
     JOIN public.roles r ON r.name = p.nome
     LEFT JOIN public.user_roles ur
       ON ur.user_id = u.id
      AND ur.role_id = r.id
     WHERE u.deleted_at IS NULL
       AND ur.user_id IS NULL
     ORDER BY p.nome ASC, u.id ASC
     LIMIT $1`,
    [sampleLimit],
  );

  const profilesWithoutRoleResult = await client.query<ProfileWithoutRoleRow>(
    `SELECT
       p.nome AS profile_name,
       COUNT(*)::bigint AS users_count
     FROM public.users u
     JOIN public.profiles p ON p.id = u.profile_id
     LEFT JOIN public.roles r ON r.name = p.nome
     WHERE u.deleted_at IS NULL
       AND r.id IS NULL
     GROUP BY p.nome
     ORDER BY users_count DESC, p.nome ASC`,
  );

  return {
    expectedLinks,
    missingLinks,
    missingLinksSample: missingLinksSampleResult.rows,
    profilesWithoutRole: profilesWithoutRoleResult.rows.map((row) => ({
      profileName: row.profile_name,
      usersCount: toInt(row.users_count),
    })),
  };
}

async function fetchTableCount(client: Client, table: string): Promise<number> {
  const result = await client.query<{ count: string }>(
    `SELECT COUNT(*)::bigint AS count FROM public.${table}`,
  );
  return toInt(result.rows[0]?.count);
}

async function fetchExistingRolePermissionPairKeys(
  client: Client,
  roleNames: string[],
  permissionNames: string[],
): Promise<Set<string>> {
  if (roleNames.length === 0 || permissionNames.length === 0) {
    return new Set();
  }

  const result = await client.query<{
    role_name: string;
    permission_name: string;
  }>(
    `SELECT
       r.name AS role_name,
       p.name AS permission_name
     FROM public.role_permissions rp
     JOIN public.roles r ON r.id = rp.role_id
     JOIN public.permissions p ON p.id = rp.permission_id
     WHERE r.name = ANY($1::text[])
       AND p.name = ANY($2::text[])`,
    [roleNames, permissionNames],
  );

  return new Set(
    result.rows.map((row) => `${row.role_name}::${row.permission_name}`),
  );
}

async function insertMissingRoles(
  client: Client,
  roleNames: string[],
): Promise<number> {
  if (roleNames.length === 0) {
    return 0;
  }

  const descriptions = roleNames.map(
    (name) => `Role auto-criada durante recover-rbac-production (${name})`,
  );

  const result = await client.query(
    `INSERT INTO public.roles (name, description)
     SELECT payload.name, payload.description
     FROM UNNEST($1::text[], $2::text[]) AS payload(name, description)
     ON CONFLICT (name) DO NOTHING`,
    [roleNames, descriptions],
  );

  return result.rowCount ?? 0;
}

async function insertMissingPermissions(
  client: Client,
  permissionNames: string[],
): Promise<number> {
  if (permissionNames.length === 0) {
    return 0;
  }

  const descriptions = permissionNames.map(
    (name) =>
      `Permissão auto-criada durante recover-rbac-production (${name})`,
  );

  const result = await client.query(
    `INSERT INTO public.permissions (name, description)
     SELECT payload.name, payload.description
     FROM UNNEST($1::text[], $2::text[]) AS payload(name, description)
     ON CONFLICT (name) DO NOTHING`,
    [permissionNames, descriptions],
  );

  return result.rowCount ?? 0;
}

async function insertMissingRolePermissions(
  client: Client,
  missingPairs: RolePermissionPair[],
): Promise<number> {
  if (missingPairs.length === 0) {
    return 0;
  }

  const roleNames = missingPairs.map((pair) => pair.roleName);
  const permissionNames = missingPairs.map((pair) => pair.permissionName);

  let inserted = 0;
  for (const chunk of chunkArray(
    roleNames.map((roleName, index) => ({
      roleName,
      permissionName: permissionNames[index],
    })),
    500,
  )) {
    const chunkRoleNames = chunk.map((pair) => pair.roleName);
    const chunkPermissionNames = chunk.map((pair) => pair.permissionName);

    const result = await client.query(
      `INSERT INTO public.role_permissions (role_id, permission_id)
       SELECT r.id, p.id
       FROM UNNEST($1::text[], $2::text[]) AS payload(role_name, permission_name)
       JOIN public.roles r ON r.name = payload.role_name
       JOIN public.permissions p ON p.name = payload.permission_name
       ON CONFLICT (role_id, permission_id) DO NOTHING`,
      [chunkRoleNames, chunkPermissionNames],
    );
    inserted += result.rowCount ?? 0;
  }

  return inserted;
}

async function insertMissingUserRoles(client: Client): Promise<number> {
  const result = await client.query(
    `INSERT INTO public.user_roles (user_id, role_id)
     SELECT u.id, r.id
     FROM public.users u
     JOIN public.profiles p ON p.id = u.profile_id
     JOIN public.roles r ON r.name = p.nome
     WHERE u.deleted_at IS NULL
     ON CONFLICT (user_id, role_id) DO NOTHING`,
  );
  return result.rowCount ?? 0;
}

async function deleteRedisByPattern(
  redis: Redis,
  pattern: string,
): Promise<number> {
  let cursor = '0';
  let deleted = 0;

  do {
    const [nextCursor, keys] = await redis.scan(
      cursor,
      'MATCH',
      pattern,
      'COUNT',
      '500',
    );
    cursor = nextCursor;

    if (keys.length > 0) {
      deleted += await redis.unlink(...keys);
    }
  } while (cursor !== '0');

  return deleted;
}

async function invalidateRedisCaches(options: {
  shouldRun: boolean;
  forceSessionRenewal: boolean;
}): Promise<RedisInvalidationReport> {
  const report: RedisInvalidationReport = {
    attempted: false,
    skippedReason: null,
    deleted: {
      rbacAccess: 0,
      refresh: 0,
      refreshSet: 0,
      consumed: 0,
    },
    warnings: [],
  };

  if (!options.shouldRun) {
    report.skippedReason =
      'Invalidação Redis pulada por flag (--skip-redis-invalidation).';
    return report;
  }

  const redisConnection = resolveRedisConnection(process.env);
  if (!redisConnection) {
    report.skippedReason =
      'Redis não configurado/indisponível no ambiente atual (nenhuma chave invalidada).';
    return report;
  }

  report.attempted = true;

  const redis = redisConnection.url
    ? new Redis(redisConnection.url, {
        lazyConnect: true,
        enableReadyCheck: false,
        maxRetriesPerRequest: 1,
        tls: redisConnection.tls,
      })
    : new Redis({
        host: redisConnection.host,
        port: redisConnection.port,
        username: redisConnection.username,
        password: redisConnection.password,
        tls: redisConnection.tls,
        lazyConnect: true,
        enableReadyCheck: false,
        maxRetriesPerRequest: 1,
      });

  try {
    await redis.connect();
    await redis.ping();

    report.deleted.rbacAccess = await deleteRedisByPattern(
      redis,
      'rbac:access:*',
    );

    if (options.forceSessionRenewal) {
      report.deleted.refresh = await deleteRedisByPattern(redis, 'refresh:*');
      report.deleted.refreshSet = await deleteRedisByPattern(
        redis,
        'refresh_set:*',
      );
      report.deleted.consumed = await deleteRedisByPattern(redis, 'consumed:*');
    }
  } catch (error) {
    report.warnings.push(
      `Falha ao invalidar Redis: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    try {
      await redis.quit();
    } catch {
      redis.disconnect();
    }
  }

  return report;
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const apply = hasFlag(args, 'apply');
  const dryRun = !apply;
  const skipRedisInvalidation = hasFlag(args, 'skip-redis-invalidation');
  const skipSessionInvalidation = hasFlag(args, 'skip-session-invalidation');
  const timestamp = createTimestampLabel(new Date());

  const outputDir = path.resolve(
    process.cwd(),
    getStringArg(args, 'output-dir') ||
      path.join('output', 'recovery', 'rbac-production'),
  );
  const reportFile = path.resolve(
    outputDir,
    getStringArg(args, 'report-file') || `recover-rbac-${timestamp}.report.json`,
  );

  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
  dotenv.config({ path: path.resolve(process.cwd(), '..', '.env') });

  await ensureDir(outputDir);

  const databaseRuntimeConfig = resolveDatabaseRuntimeConfig();

  const report: RecoveryReport = {
    version: 1,
    type: 'rbac_production_recovery',
    mode: dryRun ? 'dry_run' : 'apply',
    status: dryRun ? 'dry_run' : 'failed',
    startedAt: new Date().toISOString(),
    completedAt: null,
    reportFile,
    assumptions: {
      sourceOfTruth: 'PROFILE_PERMISSION_FALLBACK (src/rbac/rbac.service.ts)',
      fillOnlyMissing: true,
      forceSessionRenewal: !skipSessionInvalidation,
      databaseTarget: databaseRuntimeConfig.target,
    },
    summary: {
      profilesTotal: 0,
      profilesWithFallback: 0,
      profilesInvalidBefore: 0,
      profilesUpdated: 0,
      rolesMissingBefore: 0,
      rolesCreated: 0,
      permissionsMissingBefore: 0,
      permissionsCreated: 0,
      rolePermissionsBefore: 0,
      rolePermissionsMissingBefore: 0,
      rolePermissionsInserted: 0,
      rolePermissionsAfter: 0,
      userRolesBefore: 0,
      userRoleLinksExpectedBefore: 0,
      userRoleLinksMissingBefore: 0,
      userRolesInserted: 0,
      userRolesAfter: 0,
      userRoleLinksMissingAfter: 0,
      redisRbacKeysDeleted: 0,
      redisSessionKeysDeleted: 0,
    },
    details: {
      profileRepairsPlanned: [],
      profileRepairsApplied: [],
      rolesMissingBefore: [],
      permissionsMissingBefore: [],
      rolePermissionsMissingBefore: [],
      userRoleMissingBeforeSample: [],
      profilesWithoutRoleBefore: [],
      profilesWithoutRoleAfter: [],
    },
    redisInvalidation: {
      attempted: false,
      skippedReason: null,
      deleted: {
        rbacAccess: 0,
        refresh: 0,
        refreshSet: 0,
        consumed: 0,
      },
      warnings: [],
    },
    warnings: [],
    errors: [],
  };

  const desiredRoleNames = PROFILE_FALLBACK_ENTRIES.map(
    (entry) => entry.profileName,
  );
  const desiredPermissionNames = uniqueStringsInOrder(
    PROFILE_FALLBACK_ENTRIES.flatMap((entry) => entry.permissions),
  );
  const desiredRolePermissionPairs = buildDesiredRolePermissionPairs();

  const databaseUrlForPg =
    'url' in databaseRuntimeConfig
      ? stripSslModeFromConnectionString(databaseRuntimeConfig.url)
      : undefined;
  const sslConfig =
    buildPgSslConfig(
      'url' in databaseRuntimeConfig ? databaseRuntimeConfig.url : undefined,
    ) || undefined;
  const client = 'url' in databaseRuntimeConfig
    ? new Client({
        connectionString: databaseUrlForPg,
        ssl: sslConfig,
      })
    : new Client({
        host: databaseRuntimeConfig.host,
        port: databaseRuntimeConfig.port,
        user: databaseRuntimeConfig.username,
        password: databaseRuntimeConfig.password,
        database: databaseRuntimeConfig.database,
        ssl: sslConfig,
      });

  let transactionOpen = false;

  try {
    await client.connect();
    await client.query(`SET app.is_super_admin = 'true'`);

    const [profilesBefore, rolesBeforeRows, permissionsBeforeRows] =
      await Promise.all([
        fetchProfiles(client),
        fetchRoles(client),
        fetchPermissions(client),
      ]);

    const fallbackByNormalizedProfile = new Map(
      PROFILE_FALLBACK_ENTRIES.map((entry) => [
        normalizeText(entry.profileName),
        entry.permissions,
      ]),
    );

    const profileRepairsPlanned: ProfileRepairPlan[] = [];
    let profilesWithFallback = 0;
    let profilesInvalidBefore = 0;

    for (const profile of profilesBefore) {
      const fallbackPermissions = fallbackByNormalizedProfile.get(
        normalizeText(profile.nome),
      );
      if (!fallbackPermissions) {
        continue;
      }

      profilesWithFallback += 1;
      if (!isProfilePermissionPayloadInvalid(profile.permissoes)) {
        continue;
      }

      profilesInvalidBefore += 1;
      profileRepairsPlanned.push({
        profileId: profile.id,
        profileName: profile.nome,
        previousPermissoes: profile.permissoes,
        nextPermissoes: fallbackPermissions,
      });
    }

    const normalizedRoleSet = new Set(
      rolesBeforeRows.map((row) => normalizeText(row.name)),
    );
    const missingRoles = desiredRoleNames.filter(
      (name) => !normalizedRoleSet.has(normalizeText(name)),
    );

    const permissionSet = new Set(permissionsBeforeRows.map((row) => row.name));
    const missingPermissions = desiredPermissionNames.filter(
      (name) => !permissionSet.has(name),
    );

    const existingRolePermissionKeysBefore =
      await fetchExistingRolePermissionPairKeys(
        client,
        desiredRoleNames,
        desiredPermissionNames,
      );
    const rolePermissionsMissingBefore = desiredRolePermissionPairs.filter(
      (pair) =>
        !existingRolePermissionKeysBefore.has(
          `${pair.roleName}::${pair.permissionName}`,
        ),
    );

    const [userRolesBefore, rolePermissionsBefore, userRoleDiagnosticsBefore] =
      await Promise.all([
        fetchTableCount(client, 'user_roles'),
        fetchTableCount(client, 'role_permissions'),
        fetchUserRoleDiagnostics(client, 200),
      ]);

    report.summary.profilesTotal = profilesBefore.length;
    report.summary.profilesWithFallback = profilesWithFallback;
    report.summary.profilesInvalidBefore = profilesInvalidBefore;
    report.summary.rolesMissingBefore = missingRoles.length;
    report.summary.permissionsMissingBefore = missingPermissions.length;
    report.summary.rolePermissionsBefore = rolePermissionsBefore;
    report.summary.rolePermissionsMissingBefore =
      rolePermissionsMissingBefore.length;
    report.summary.userRolesBefore = userRolesBefore;
    report.summary.userRoleLinksExpectedBefore =
      userRoleDiagnosticsBefore.expectedLinks;
    report.summary.userRoleLinksMissingBefore = userRoleDiagnosticsBefore.missingLinks;
    report.summary.userRoleLinksMissingAfter = userRoleDiagnosticsBefore.missingLinks;
    report.summary.rolePermissionsAfter = rolePermissionsBefore;
    report.summary.userRolesAfter = userRolesBefore;

    report.details.profileRepairsPlanned = profileRepairsPlanned;
    report.details.rolesMissingBefore = missingRoles;
    report.details.permissionsMissingBefore = missingPermissions;
    report.details.rolePermissionsMissingBefore = rolePermissionsMissingBefore;
    report.details.userRoleMissingBeforeSample =
      userRoleDiagnosticsBefore.missingLinksSample;
    report.details.profilesWithoutRoleBefore =
      userRoleDiagnosticsBefore.profilesWithoutRole;
    report.details.profilesWithoutRoleAfter =
      userRoleDiagnosticsBefore.profilesWithoutRole;

    if (dryRun) {
      report.status = 'dry_run';
      report.warnings.push(
        'Dry-run executado: nenhuma alteração persistida em banco ou Redis.',
      );
    } else {
      await client.query('BEGIN');
      transactionOpen = true;
      await client.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
      await client.query(`SET LOCAL app.is_super_admin = 'true'`);

      const repairedProfiles: string[] = [];
      for (const plan of profileRepairsPlanned) {
        const updateResult = await client.query(
          `UPDATE public.profiles
           SET permissoes = $2::jsonb,
               updated_at = NOW()
           WHERE id = $1`,
          [plan.profileId, JSON.stringify(plan.nextPermissoes)],
        );
        if ((updateResult.rowCount ?? 0) > 0) {
          repairedProfiles.push(plan.profileId);
        }
      }
      report.summary.profilesUpdated = repairedProfiles.length;
      report.details.profileRepairsApplied = repairedProfiles;

      report.summary.rolesCreated = await insertMissingRoles(client, missingRoles);
      report.summary.permissionsCreated = await insertMissingPermissions(
        client,
        missingPermissions,
      );
      report.summary.rolePermissionsInserted = await insertMissingRolePermissions(
        client,
        rolePermissionsMissingBefore,
      );
      report.summary.userRolesInserted = await insertMissingUserRoles(client);

      await client.query('COMMIT');
      transactionOpen = false;

      const [rolePermissionsAfter, userRolesAfter, userRoleDiagnosticsAfter] =
        await Promise.all([
          fetchTableCount(client, 'role_permissions'),
          fetchTableCount(client, 'user_roles'),
          fetchUserRoleDiagnostics(client, 200),
        ]);

      report.summary.rolePermissionsAfter = rolePermissionsAfter;
      report.summary.userRolesAfter = userRolesAfter;
      report.summary.userRoleLinksMissingAfter =
        userRoleDiagnosticsAfter.missingLinks;
      report.details.profilesWithoutRoleAfter =
        userRoleDiagnosticsAfter.profilesWithoutRole;

      report.redisInvalidation = await invalidateRedisCaches({
        shouldRun: !skipRedisInvalidation,
        forceSessionRenewal: !skipSessionInvalidation,
      });
      report.summary.redisRbacKeysDeleted =
        report.redisInvalidation.deleted.rbacAccess;
      report.summary.redisSessionKeysDeleted =
        report.redisInvalidation.deleted.refresh +
        report.redisInvalidation.deleted.refreshSet +
        report.redisInvalidation.deleted.consumed;

      if (report.redisInvalidation.warnings.length > 0) {
        report.warnings.push(...report.redisInvalidation.warnings);
      }

      report.status = 'success';
    }
  } catch (error) {
    if (transactionOpen) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        report.warnings.push(
          `Falha ao executar rollback: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
        );
      }
    }

    report.status = 'failed';
    report.errors.push(
      error instanceof Error ? error.message : `Erro inesperado: ${String(error)}`,
    );
  } finally {
    report.completedAt = new Date().toISOString();

    report.details.profileRepairsPlanned = report.details.profileRepairsPlanned.map(
      (plan) => ({
        ...plan,
        previousPermissoes: previewJson(plan.previousPermissoes),
      }),
    );

    await writeJsonFile(reportFile, report);
    console.log(JSON.stringify(report, null, 2));
    console.log(`REPORT_FILE=${reportFile}`);

    try {
      await client.end();
    } catch {
      // noop
    }
  }

  if (report.status === 'failed') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    `Falha no recover-rbac-production: ${error instanceof Error ? error.stack || error.message : String(error)}`,
  );
  process.exitCode = 1;
});
