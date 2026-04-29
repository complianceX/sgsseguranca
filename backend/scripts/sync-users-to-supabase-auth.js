const path = require('path');
const dotenv = require('dotenv');
const { connectRuntimePgClient } = require('./lib/pg-runtime-client');

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function getArgValue(prefix, fallback) {
  const match = process.argv.find((arg) => arg.startsWith(`${prefix}=`));
  if (!match) return fallback;
  return match.slice(prefix.length + 1);
}

function normalizeEmail(value) {
  return typeof value === 'string' && value.trim()
    ? value.trim().toLowerCase()
    : null;
}

function normalizeText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function buildMetadata(row) {
  const profileName = normalizeText(row.profile_name);
  const appMetadata = stripUndefined({
    app_user_id: row.id,
    company_id: row.company_id,
    profile_name: profileName,
    user_role: profileName,
    is_super_admin: profileName === 'Administrador Geral' ? true : undefined,
  });
  const userMetadata = stripUndefined({
    app_user_id: row.id,
    company_id: row.company_id,
    profile_name: profileName,
    cpf: normalizeText(row.cpf),
  });

  return stripUndefined({
    email: normalizeEmail(row.email),
    email_confirm: true,
    app_metadata: Object.keys(appMetadata).length > 0 ? appMetadata : undefined,
    user_metadata:
      Object.keys(userMetadata).length > 0 ? userMetadata : undefined,
    ban_duration: row.status === false ? '876000h' : undefined,
  });
}

function stripUndefined(value) {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, entry]) => entry !== undefined && entry !== null,
    ),
  );
}

async function requestSupabaseAdmin(pathname, init) {
  const baseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!baseUrl || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios para --apply.',
    );
  }

  const response = await fetch(`${baseUrl}${pathname}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Supabase admin API falhou (${response.status}): ${body.slice(0, 300)}`,
    );
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function findAuthUserIdByEmail(client, email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const { rows } = await client.query(
    `
      SELECT id
      FROM auth.users
      WHERE lower(email) = lower($1)
      LIMIT 1
    `,
    [normalizedEmail],
  );

  return rows[0]?.id || null;
}

async function hasSupabasePassword(client, authUserId) {
  if (!authUserId) return false;
  const { rows } = await client.query(
    `
      SELECT encrypted_password IS NOT NULL
        AND btrim(encrypted_password) <> '' AS has_password
      FROM auth.users
      WHERE id = $1::uuid
      LIMIT 1
    `,
    [authUserId],
  );
  return rows[0]?.has_password === true;
}

async function upsertAuthUser(row, existingAuthUserId) {
  const payload = buildMetadata(row);
  if (existingAuthUserId) {
    await requestSupabaseAdmin(`/auth/v1/admin/users/${existingAuthUserId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return existingAuthUserId;
  }

  const created = await requestSupabaseAdmin('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return created?.user?.id || created?.id || null;
}

async function main() {
  const apply = hasFlag('--apply');
  const limit = Number(getArgValue('--limit', '0') || '0');

  const { client, databaseConfig, warnings, usedInsecureFallback } =
    await connectRuntimePgClient({ useAdministrativeConfig: true });

  try {
    console.log('sync-users-to-supabase-auth');
    console.log(`database: ${databaseConfig.target}`);
    if (warnings.length > 0) {
      for (const warning of warnings) {
        console.log(`warning: ${warning}`);
      }
    }
    if (usedInsecureFallback) {
      console.log(
        'warning: TLS fallback inseguro em uso apenas para operação controlada.',
      );
    }
    console.log(`mode: ${apply ? 'apply' : 'dry-run'}`);

    const { rows } = await client.query(
      `
        SELECT
          u.id,
          u.email,
          u.cpf,
          u.company_id,
          u.auth_user_id,
          u.status,
          -- password incluído apenas para dry-run diagnóstico (não enviado ao Supabase)
          u.password,
          p.nome AS profile_name
        FROM public.users u
        LEFT JOIN public.profiles p
          ON p.id = u.profile_id
        WHERE u.deleted_at IS NULL
        ORDER BY u.created_at ASC
        ${limit > 0 ? 'LIMIT $1' : ''}
      `,
      limit > 0 ? [limit] : [],
    );

    const summary = {
      total: rows.length,
      updatedBridgeOnly: 0,
      createdAuthUsers: 0,
      updatedAuthUsers: 0,
      skippedMissingEmail: 0,
      alreadySynced: 0,
      failed: 0,
      // Diagnóstico de senhas — apenas preenchido em dry-run
      withSupabasePassword: 0,
      withoutSupabasePassword: 0,
      withLocalPassword: 0,
      withoutLocalPassword: 0,
    };

    for (const row of rows) {
      const email = normalizeEmail(row.email);
      if (!email) {
        summary.skippedMissingEmail += 1;
        console.log(`skip missing-email user=${row.id}`);
        continue;
      }

      try {
        const matchedAuthUserId =
          row.auth_user_id || (await findAuthUserIdByEmail(client, email));

        if (!apply) {
          const hasLocalPwd =
            typeof row.password === 'string' && row.password.trim() !== '';
          const hasSupabasePwd = matchedAuthUserId
            ? await hasSupabasePassword(client, matchedAuthUserId)
            : false;

          if (hasLocalPwd) {
            summary.withLocalPassword += 1;
          } else {
            summary.withoutLocalPassword += 1;
          }

          if (hasSupabasePwd) {
            summary.withSupabasePassword += 1;
          } else {
            summary.withoutSupabasePassword += 1;
          }

          if (matchedAuthUserId && row.auth_user_id !== matchedAuthUserId) {
            summary.updatedBridgeOnly += 1;
            console.log(
              `plan bridge-backfill user=${row.id} auth=${matchedAuthUserId}` +
                ` local_pwd=${hasLocalPwd} supabase_pwd=${hasSupabasePwd}`,
            );
          } else if (matchedAuthUserId) {
            summary.alreadySynced += 1;
            // Emite aviso quando bridge existe mas não há senha em nenhum lado
            if (!hasLocalPwd && !hasSupabasePwd) {
              console.log(
                `warn no-password user=${row.id} auth=${matchedAuthUserId}` +
                  ` — sem senha local nem no Supabase Auth; usuário não consegue logar`,
              );
            } else {
              console.log(
                `ok synced user=${row.id} auth=${matchedAuthUserId}` +
                  ` local_pwd=${hasLocalPwd} supabase_pwd=${hasSupabasePwd}`,
              );
            }
          } else {
            summary.createdAuthUsers += 1;
            console.log(
              `plan create-auth user=${row.id} email=${email}` +
                ` local_pwd=${hasLocalPwd}` +
                (hasLocalPwd ? '' : ' — sem senha local; precisará de reset'),
            );
          }
          continue;
        }

        const authUserId = await upsertAuthUser(row, matchedAuthUserId);
        if (!authUserId) {
          throw new Error('Supabase não retornou auth_user_id.');
        }

        await client.query(
          `UPDATE public.users SET auth_user_id = $2 WHERE id = $1`,
          [row.id, authUserId],
        );

        if (!matchedAuthUserId) {
          summary.createdAuthUsers += 1;
          console.log(`created auth user=${row.id} auth=${authUserId}`);
        } else if (row.auth_user_id !== authUserId) {
          summary.updatedBridgeOnly += 1;
          console.log(`backfilled bridge user=${row.id} auth=${authUserId}`);
        } else {
          summary.updatedAuthUsers += 1;
          console.log(
            `updated auth metadata user=${row.id} auth=${authUserId}`,
          );
        }
      } catch (error) {
        summary.failed += 1;
        console.error(
          `fail user=${row.id} email=${email}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    console.log('summary', JSON.stringify(summary, null, 2));
    if (!apply) {
      console.log(
        'dry-run complete. Execute com --apply para persistir alterações.',
      );
      if (summary.withoutSupabasePassword > 0) {
        console.log(
          `\nATENCAO: ${summary.withoutSupabasePassword} usuário(s) sem senha no Supabase Auth.`,
        );
        if (summary.withLocalPassword > 0) {
          console.log(
            `  ${summary.withLocalPassword} têm senha local — o login vai funcionar com LEGACY_PASSWORD_AUTH_ENABLED=true`,
          );
          console.log(
            `  e a senha será sincronizada automaticamente no Supabase Auth após cada login bem-sucedido.`,
          );
        }
        if (summary.withoutLocalPassword > 0) {
          console.log(
            `  ${summary.withoutLocalPassword} NÃO têm senha local nem no Supabase Auth — precisam de reset de senha.`,
          );
          console.log(
            `  Execute: npm run recovery:null-password:dry para listar e tratar esses usuários.`,
          );
        }
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.stack || error.message : String(error),
  );
  process.exit(1);
});
