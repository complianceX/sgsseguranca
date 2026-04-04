-- ============================================================================
-- SGS SEGURANCA - STANDARDIZE SENSITIVE UUID COLUMNS
-- ============================================================================
-- Objetivo: padronizar colunas de tenant/usuario em tabelas sensiveis para UUID
-- e adicionar FKs apenas onde a integridade referencial e operacional e segura.
--
-- Decisoes desta etapa:
-- - ai_interactions.user_id permanece varchar por compatibilidade com registros
--   historicos que podem usar valores sentinela como 'unknown'.
-- - audit_logs e forensic_trail_events recebem padronizacao de tipo, mas sem FK
--   para nao introduzir bloqueios indevidos sobre trilhas historicas.
-- - tabelas operacionais (notifications, push_subscriptions,
--   document_video_attachments, ai_interactions.tenant_id) recebem FKs.
-- ============================================================================

DO $$
DECLARE
  uuid_pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  invalid_count bigint;
BEGIN
  SELECT count(*) INTO invalid_count
  FROM public.audit_logs
  WHERE "companyId" IS NULL
     OR btrim("companyId") = ''
     OR "companyId" !~* uuid_pattern;

  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Cannot convert public.audit_logs."companyId" to uuid: % invalid row(s)', invalid_count;
  END IF;

  SELECT count(*) INTO invalid_count
  FROM public.audit_logs
  WHERE "userId" IS NULL
     OR btrim("userId") = ''
     OR "userId" !~* uuid_pattern;

  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Cannot convert public.audit_logs."userId" to uuid: % invalid row(s)', invalid_count;
  END IF;

  SELECT count(*) INTO invalid_count
  FROM public.audit_logs
  WHERE user_id IS NOT NULL
    AND btrim(user_id) <> ''
    AND user_id !~* uuid_pattern;

  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Cannot convert public.audit_logs.user_id to uuid: % invalid row(s)', invalid_count;
  END IF;

  SELECT count(*) INTO invalid_count
  FROM public.document_video_attachments
  WHERE company_id IS NULL
     OR btrim(company_id) = ''
     OR company_id !~* uuid_pattern;

  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Cannot convert public.document_video_attachments.company_id to uuid: % invalid row(s)', invalid_count;
  END IF;

  SELECT count(*) INTO invalid_count
  FROM public.document_video_attachments
  WHERE uploaded_by_id IS NOT NULL
    AND btrim(uploaded_by_id) <> ''
    AND uploaded_by_id !~* uuid_pattern;

  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Cannot convert public.document_video_attachments.uploaded_by_id to uuid: % invalid row(s)', invalid_count;
  END IF;

  SELECT count(*) INTO invalid_count
  FROM public.document_video_attachments
  WHERE removed_by_id IS NOT NULL
    AND btrim(removed_by_id) <> ''
    AND removed_by_id !~* uuid_pattern;

  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Cannot convert public.document_video_attachments.removed_by_id to uuid: % invalid row(s)', invalid_count;
  END IF;

  SELECT count(*) INTO invalid_count
  FROM public.forensic_trail_events
  WHERE company_id IS NOT NULL
    AND btrim(company_id) <> ''
    AND company_id !~* uuid_pattern;

  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Cannot convert public.forensic_trail_events.company_id to uuid: % invalid row(s)', invalid_count;
  END IF;

  SELECT count(*) INTO invalid_count
  FROM public.forensic_trail_events
  WHERE user_id IS NOT NULL
    AND btrim(user_id) <> ''
    AND user_id !~* uuid_pattern;

  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Cannot convert public.forensic_trail_events.user_id to uuid: % invalid row(s)', invalid_count;
  END IF;

  SELECT count(*) INTO invalid_count
  FROM public.notifications
  WHERE "userId" IS NULL
     OR btrim("userId") = ''
     OR "userId" !~* uuid_pattern;

  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Cannot convert public.notifications."userId" to uuid: % invalid row(s)', invalid_count;
  END IF;

  SELECT count(*) INTO invalid_count
  FROM public.push_subscriptions
  WHERE "userId" IS NULL
     OR btrim("userId") = ''
     OR "userId" !~* uuid_pattern;

  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Cannot convert public.push_subscriptions."userId" to uuid: % invalid row(s)', invalid_count;
  END IF;

  SELECT count(*) INTO invalid_count
  FROM public.ai_interactions
  WHERE tenant_id IS NULL
     OR btrim(tenant_id) = ''
     OR tenant_id !~* uuid_pattern;

  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Cannot convert public.ai_interactions.tenant_id to uuid: % invalid row(s)', invalid_count;
  END IF;
END $$;

DROP POLICY IF EXISTS tenant_isolation_policy ON public.audit_logs;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.document_video_attachments;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.forensic_trail_events;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.notifications;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.push_subscriptions;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.ai_interactions;

ALTER TABLE public.audit_logs
  ALTER COLUMN "companyId" TYPE uuid USING ("companyId"::uuid),
  ALTER COLUMN "userId" TYPE uuid USING ("userId"::uuid),
  ALTER COLUMN user_id TYPE uuid USING (
    CASE
      WHEN user_id IS NULL OR btrim(user_id) = '' THEN NULL
      ELSE user_id::uuid
    END
  );

ALTER TABLE public.document_video_attachments
  ALTER COLUMN company_id TYPE uuid USING (company_id::uuid),
  ALTER COLUMN uploaded_by_id TYPE uuid USING (
    CASE
      WHEN uploaded_by_id IS NULL OR btrim(uploaded_by_id) = '' THEN NULL
      ELSE uploaded_by_id::uuid
    END
  ),
  ALTER COLUMN removed_by_id TYPE uuid USING (
    CASE
      WHEN removed_by_id IS NULL OR btrim(removed_by_id) = '' THEN NULL
      ELSE removed_by_id::uuid
    END
  );

ALTER TABLE public.forensic_trail_events
  ALTER COLUMN company_id TYPE uuid USING (
    CASE
      WHEN company_id IS NULL OR btrim(company_id) = '' THEN NULL
      ELSE company_id::uuid
    END
  ),
  ALTER COLUMN user_id TYPE uuid USING (
    CASE
      WHEN user_id IS NULL OR btrim(user_id) = '' THEN NULL
      ELSE user_id::uuid
    END
  );

ALTER TABLE public.notifications
  ALTER COLUMN "userId" TYPE uuid USING ("userId"::uuid);

ALTER TABLE public.push_subscriptions
  ALTER COLUMN "userId" TYPE uuid USING ("userId"::uuid);

ALTER TABLE public.ai_interactions
  ALTER COLUMN tenant_id TYPE uuid USING (tenant_id::uuid);

ALTER TABLE public.document_video_attachments
  ADD CONSTRAINT "FK_document_video_attachments_company_id"
    FOREIGN KEY (company_id) REFERENCES public.companies(id),
  ADD CONSTRAINT "FK_document_video_attachments_uploaded_by_id"
    FOREIGN KEY (uploaded_by_id) REFERENCES public.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT "FK_document_video_attachments_removed_by_id"
    FOREIGN KEY (removed_by_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.notifications
  ADD CONSTRAINT "FK_notifications_userId"
    FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT "FK_push_subscriptions_userId"
    FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE public.ai_interactions
  ADD CONSTRAINT "FK_ai_interactions_tenant_id"
    FOREIGN KEY (tenant_id) REFERENCES public.companies(id);

CREATE POLICY tenant_isolation_policy ON public.audit_logs
USING ((((("companyId")::text = (public.current_company())::text)) OR (public.is_super_admin() = true)))
WITH CHECK ((((("companyId")::text = (public.current_company())::text)) OR (public.is_super_admin() = true)));

CREATE POLICY tenant_isolation_policy ON public.document_video_attachments
USING ((((company_id)::text = (public.current_company())::text) OR (public.is_super_admin() = true)))
WITH CHECK ((((company_id)::text = (public.current_company())::text) OR (public.is_super_admin() = true)));

CREATE POLICY tenant_isolation_policy ON public.forensic_trail_events
USING ((((company_id IS NOT NULL) AND ((company_id)::text = (public.current_company())::text)) OR (public.is_super_admin() = true)))
WITH CHECK ((((company_id IS NOT NULL) AND ((company_id)::text = (public.current_company())::text)) OR (public.is_super_admin() = true)));

CREATE POLICY tenant_isolation_policy ON public.notifications
USING (((EXISTS (
    SELECT 1
    FROM public.users u
    WHERE ((u.id)::text = ("userId")::text)
      AND ((u.company_id = public.current_company()) OR (public.is_super_admin() = true))
  ))))
WITH CHECK (((EXISTS (
    SELECT 1
    FROM public.users u
    WHERE ((u.id)::text = ("userId")::text)
      AND ((u.company_id = public.current_company()) OR (public.is_super_admin() = true))
  ))));

CREATE POLICY tenant_isolation_policy ON public.push_subscriptions
USING (((EXISTS (
    SELECT 1
    FROM public.users u
    WHERE ((u.id)::text = ("userId")::text)
      AND ((u.company_id = public.current_company()) OR (public.is_super_admin() = true))
  ))))
WITH CHECK (((EXISTS (
    SELECT 1
    FROM public.users u
    WHERE ((u.id)::text = ("userId")::text)
      AND ((u.company_id = public.current_company()) OR (public.is_super_admin() = true))
  ))));

CREATE POLICY tenant_isolation_policy ON public.ai_interactions
USING ((((tenant_id)::text = (public.current_company())::text) OR (public.is_super_admin() = true)))
WITH CHECK ((((tenant_id)::text = (public.current_company())::text) OR (public.is_super_admin() = true)));
