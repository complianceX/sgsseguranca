-- Endurece a persistência operacional de sessões para produção.

ALTER TABLE public.user_sessions
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

UPDATE public.user_sessions
SET expires_at = COALESCE(
  expires_at,
  (created_at AT TIME ZONE 'UTC') + INTERVAL '30 days'
)
WHERE expires_at IS NULL;

ALTER TABLE public.user_sessions
  ALTER COLUMN expires_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS "IDX_user_sessions_user_active_last_active"
  ON public.user_sessions (user_id, is_active, last_active DESC);

CREATE INDEX IF NOT EXISTS "IDX_user_sessions_expires_at_active"
  ON public.user_sessions (expires_at)
  WHERE is_active = true AND revoked_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_user_sessions_token_hash_active"
  ON public.user_sessions (token_hash)
  WHERE token_hash IS NOT NULL;
