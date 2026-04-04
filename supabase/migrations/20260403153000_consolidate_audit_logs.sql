-- Consolidacao de contrato canonico em public.audit_logs.
-- Objetivo:
-- - validar consistencia entre colunas canonicas e legadas
-- - manter apenas userId/entity/entityId/companyId/timestamp como contrato suportado
-- - remover colunas duplicadas herdadas do legado

DO $$
DECLARE
  mismatch_count bigint;
BEGIN
  SELECT COUNT(*)
  INTO mismatch_count
  FROM public.audit_logs
  WHERE user_id IS NOT NULL
    AND "userId" IS NOT NULL
    AND user_id <> "userId";

  IF mismatch_count > 0 THEN
    RAISE EXCEPTION 'Cannot consolidate public.audit_logs: % row(s) have conflicting user identifiers', mismatch_count;
  END IF;

  SELECT COUNT(*)
  INTO mismatch_count
  FROM public.audit_logs
  WHERE entity_type IS NOT NULL
    AND btrim(entity_type) <> ''
    AND entity IS NOT NULL
    AND btrim(entity) <> ''
    AND entity_type <> entity;

  IF mismatch_count > 0 THEN
    RAISE EXCEPTION 'Cannot consolidate public.audit_logs: % row(s) have conflicting entity/entity_type values', mismatch_count;
  END IF;

  SELECT COUNT(*)
  INTO mismatch_count
  FROM public.audit_logs
  WHERE entity_id IS NOT NULL
    AND btrim(entity_id) <> ''
    AND "entityId" IS NOT NULL
    AND btrim("entityId") <> ''
    AND entity_id <> "entityId";

  IF mismatch_count > 0 THEN
    RAISE EXCEPTION 'Cannot consolidate public.audit_logs: % row(s) have conflicting entity identifiers', mismatch_count;
  END IF;
END
$$;

UPDATE public.audit_logs
SET
  "userId" = COALESCE("userId", user_id),
  entity = COALESCE(NULLIF(btrim(entity), ''), NULLIF(btrim(entity_type), ''), entity),
  "entityId" = COALESCE(NULLIF(btrim("entityId"), ''), NULLIF(btrim(entity_id), ''), "entityId"),
  "timestamp" = COALESCE("timestamp", created_at, now())
WHERE user_id IS NOT NULL
   OR entity_type IS NOT NULL
   OR entity_id IS NOT NULL
   OR created_at IS NOT NULL;

ALTER TABLE public.audit_logs
  ALTER COLUMN "timestamp" SET DEFAULT now(),
  ALTER COLUMN "timestamp" SET NOT NULL;

ALTER TABLE public.audit_logs
  DROP COLUMN IF EXISTS user_id,
  DROP COLUMN IF EXISTS entity_type,
  DROP COLUMN IF EXISTS entity_id,
  DROP COLUMN IF EXISTS created_at;
