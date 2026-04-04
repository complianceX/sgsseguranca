-- Compatibiliza o schema com access tokens emitidos pelo Supabase Auth.
-- Objetivos:
-- 1. RLS continuar funcionando via app.current_company_id/app.is_super_admin.
-- 2. RLS também aceitar request.jwt.claims quando a chamada vier do ecossistema Supabase.
-- 3. Enriquecer access tokens do Supabase Auth com claims canônicas do domínio.

CREATE OR REPLACE FUNCTION public.current_company() RETURNS uuid
    LANGUAGE plpgsql STABLE
    AS $$
      DECLARE
        v text;
        claims jsonb;
      BEGIN
        v := current_setting('app.current_company_id', true);
        IF v IS NULL OR btrim(v) = '' THEN
          v := current_setting('app.current_company', true);
        END IF;

        IF v IS NULL OR btrim(v) = '' THEN
          BEGIN
            claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
          EXCEPTION
            WHEN others THEN
              claims := NULL;
          END;

          IF claims IS NOT NULL THEN
            v := coalesce(
              claims ->> 'company_id',
              claims ->> 'companyId',
              claims ->> 'tenant_id',
              claims ->> 'tenantId',
              claims -> 'app_metadata' ->> 'company_id',
              claims -> 'app_metadata' ->> 'companyId',
              claims -> 'app_metadata' ->> 'tenant_id',
              claims -> 'app_metadata' ->> 'tenantId'
            );
          END IF;
        END IF;

        IF v IS NULL OR btrim(v) = '' THEN
          RETURN NULL;
        END IF;

        RETURN v::uuid;
      EXCEPTION
        WHEN others THEN
          RETURN NULL;
      END;
      $$;

CREATE OR REPLACE FUNCTION public.current_user_role() RETURNS text
    LANGUAGE plpgsql STABLE
    AS $$
      DECLARE
        v text;
        claims jsonb;
      BEGIN
        v := current_setting('app.user_role', true);
        IF v IS NULL OR btrim(v) = '' THEN
          BEGIN
            claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
          EXCEPTION
            WHEN others THEN
              claims := NULL;
          END;

          IF claims IS NOT NULL THEN
            v := coalesce(
              claims -> 'profile' ->> 'nome',
              claims ->> 'profile_name',
              claims ->> 'user_role',
              claims -> 'app_metadata' ->> 'profile_name',
              claims -> 'app_metadata' ->> 'user_role'
            );
          END IF;
        END IF;

        IF v IS NULL OR btrim(v) = '' THEN
          RETURN 'USER';
        END IF;

        IF lower(v) IN ('authenticated', 'anon', 'service_role', 'supabase_admin') THEN
          RETURN 'USER';
        END IF;

        RETURN v;
      EXCEPTION
        WHEN others THEN
          RETURN 'USER';
      END;
      $$;

CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS boolean
    LANGUAGE plpgsql STABLE
    AS $$
      DECLARE
        v text;
        claims jsonb;
      BEGIN
        v := current_setting('app.is_super_admin', true);
        IF v IS NOT NULL AND btrim(v) <> '' THEN
          RETURN v::boolean;
        END IF;

        BEGIN
          claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
        EXCEPTION
          WHEN others THEN
            claims := NULL;
        END;

        IF claims IS NULL THEN
          RETURN false;
        END IF;

        v := coalesce(
          claims ->> 'is_super_admin',
          claims ->> 'isSuperAdmin',
          claims -> 'app_metadata' ->> 'is_super_admin',
          claims -> 'app_metadata' ->> 'isSuperAdmin'
        );

        IF v IS NOT NULL AND btrim(v) <> '' THEN
          RETURN lower(v) = 'true';
        END IF;

        RETURN coalesce(
          claims -> 'profile' ->> 'nome',
          claims ->> 'profile_name',
          claims ->> 'user_role',
          claims -> 'app_metadata' ->> 'profile_name',
          claims -> 'app_metadata' ->> 'user_role'
        ) = 'Administrador Geral';
      EXCEPTION
        WHEN others THEN
          RETURN false;
      END;
      $$;

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public, auth
AS $$
DECLARE
  claims jsonb := coalesce(event->'claims', '{}'::jsonb);
  app_metadata jsonb := coalesce(claims->'app_metadata', '{}'::jsonb);
  hook_user_id uuid;
  app_user_id uuid;
  company_id uuid;
  app_user_cpf text;
  profile_name text;
  is_admin boolean := false;
BEGIN
  BEGIN
    hook_user_id := nullif(event->>'user_id', '')::uuid;
  EXCEPTION
    WHEN others THEN
      RETURN event;
  END;

  SELECT
    u.id,
    u.company_id,
    u.cpf,
    p.nome
  INTO
    app_user_id,
    company_id,
    app_user_cpf,
    profile_name
  FROM public.users u
  LEFT JOIN public.profiles p
    ON p.id = u.profile_id
   AND p.status = true
  WHERE u.auth_user_id = hook_user_id
    AND u.status = true
    AND u.deleted_at IS NULL
  LIMIT 1;

  is_admin := profile_name = 'Administrador Geral';

  claims := claims || jsonb_strip_nulls(
    jsonb_build_object(
      'auth_user_id', hook_user_id::text,
      'app_user_id', app_user_id::text,
      'company_id', company_id::text,
      'profile', CASE
        WHEN profile_name IS NULL THEN NULL
        ELSE jsonb_build_object('nome', profile_name)
      END,
      'profile_name', profile_name,
      'user_role', profile_name,
      'is_super_admin', CASE
        WHEN profile_name IS NULL THEN NULL
        ELSE is_admin
      END,
      'cpf', app_user_cpf
    )
  );

  app_metadata := app_metadata || jsonb_strip_nulls(
    jsonb_build_object(
      'auth_user_id', hook_user_id::text,
      'app_user_id', app_user_id::text,
      'company_id', company_id::text,
      'profile_name', profile_name,
      'user_role', profile_name,
      'is_super_admin', CASE
        WHEN profile_name IS NULL THEN NULL
        ELSE is_admin
      END
    )
  );

  claims := jsonb_set(claims, '{app_metadata}', app_metadata, true);
  event := jsonb_set(event, '{claims}', claims, true);
  RETURN event;
END;
$$;

COMMENT ON FUNCTION public.custom_access_token_hook(jsonb) IS
  'Supabase Auth custom access token hook: injeta app_user_id, company_id, perfil e flags administrativas a partir de public.users.';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'supabase_auth_admin'
  ) THEN
    GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
    GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
    REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM authenticated, anon, PUBLIC;

    GRANT SELECT (id, auth_user_id, company_id, profile_id, cpf, status, deleted_at)
      ON TABLE public.users
      TO supabase_auth_admin;
    GRANT SELECT (id, nome, status)
      ON TABLE public.profiles
      TO supabase_auth_admin;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'supabase_auth_admin'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'users'
      AND policyname = 'auth_hook_supabase_auth_admin_read'
  ) THEN
    EXECUTE '
      CREATE POLICY auth_hook_supabase_auth_admin_read
      ON public.users
      FOR SELECT
      TO supabase_auth_admin
      USING (true)
    ';
  END IF;
END
$$;
