-- Prepara a ponte entre public.users e auth.users sem trocar o provedor
-- de autenticação nesta etapa.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS auth_user_id uuid;

COMMENT ON COLUMN public.users.password IS
  'LEGACY: senha local temporária. O alvo arquitetural é Supabase Auth; remover em migração posterior.';

COMMENT ON COLUMN public.users.auth_user_id IS
  'Bridge para auth.users(id) durante a migração gradual para Supabase Auth.';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.schemata
    WHERE schema_name = 'auth'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'FK_users_auth_user_id'
        AND conrelid = 'public.users'::regclass
    ) THEN
      ALTER TABLE public.users
        ADD CONSTRAINT "FK_users_auth_user_id"
          FOREIGN KEY (auth_user_id)
          REFERENCES auth.users(id)
          ON DELETE SET NULL;
    END IF;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_auth_user_id"
  ON public.users (auth_user_id)
  WHERE auth_user_id IS NOT NULL;
