-- Faz o backfill inicial de public.users.auth_user_id a partir de auth.users
-- por e-mail normalizado. Só atua quando o schema auth existir.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.schemata
    WHERE schema_name = 'auth'
  ) THEN
    UPDATE public.users AS u
       SET auth_user_id = au.id
      FROM auth.users AS au
     WHERE u.auth_user_id IS NULL
       AND u.email IS NOT NULL
       AND u.deleted_at IS NULL
       AND au.email IS NOT NULL
       AND lower(trim(u.email)) = lower(trim(au.email));
  END IF;
END
$$;
