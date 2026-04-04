-- Remedia legado sistêmico que bloqueava o endurecimento final do schema.
-- - preserva eventos de RBAC review com UUIDs técnicos reservados
-- - remove interações de IA órfãs/sentinela que já falharam sem resposta útil

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'audit_logs'
      AND column_name = 'companyId'
  ) THEN
    EXECUTE $sql$
      UPDATE public.audit_logs
      SET
        "companyId" = '11111111-1111-4111-8111-111111111111',
        "userId" = '11111111-1111-4111-8111-111111111112'
      WHERE ("companyId")::text = 'system'
         OR ("userId")::text = 'system-rbac-review'
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'audit_logs'
      AND column_name = 'user_id'
  ) THEN
    EXECUTE $sql$
      UPDATE public.audit_logs
      SET user_id = '11111111-1111-4111-8111-111111111112'
      WHERE user_id::text = 'system-rbac-review'
    $sql$;
  END IF;
END
$$;

DO $$
DECLARE
  user_id_type text;
BEGIN
  SELECT data_type
    INTO user_id_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'ai_interactions'
    AND column_name = 'user_id';

  IF user_id_type IS DISTINCT FROM 'uuid' THEN
    EXECUTE $sql$
      DELETE FROM public.ai_interactions
      WHERE user_id IN ('system', 'unknown')
        AND status = 'error'
        AND response IS NULL
    $sql$;
  END IF;
END
$$;
