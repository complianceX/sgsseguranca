-- ============================================================================
-- SGS SEGURANCA - RLS HARDENING FOR SENSITIVE TABLES
-- ============================================================================
-- Objetivo: fechar as principais lacunas de isolamento multi-tenant detectadas
-- no baseline inicial, preservando compatibilidade com o modelo atual baseado
-- em public.current_company() + public.is_super_admin().
-- ============================================================================

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.companies FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON public.companies
USING (((id = public.current_company()) OR (public.is_super_admin() = true)))
WITH CHECK (((id = public.current_company()) OR (public.is_super_admin() = true)));

ALTER TABLE public.monthly_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.monthly_snapshots FORCE ROW LEVEL SECURITY;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.audit_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON public.audit_logs
USING ((((("companyId")::text = (public.current_company())::text)) OR (public.is_super_admin() = true)))
WITH CHECK ((((("companyId")::text = (public.current_company())::text)) OR (public.is_super_admin() = true)));

ALTER TABLE public.document_video_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.document_video_attachments FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON public.document_video_attachments
USING ((((company_id)::text = (public.current_company())::text) OR (public.is_super_admin() = true)))
WITH CHECK ((((company_id)::text = (public.current_company())::text) OR (public.is_super_admin() = true)));

ALTER TABLE public.forensic_trail_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.forensic_trail_events FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON public.forensic_trail_events
USING ((((company_id IS NOT NULL) AND ((company_id)::text = (public.current_company())::text)) OR (public.is_super_admin() = true)))
WITH CHECK ((((company_id IS NOT NULL) AND ((company_id)::text = (public.current_company())::text)) OR (public.is_super_admin() = true)));

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.notifications FORCE ROW LEVEL SECURITY;

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

ALTER TABLE public.pdf_integrity_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.pdf_integrity_records FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON public.pdf_integrity_records
USING ((((company_id = public.current_company()) OR (public.is_super_admin() = true))))
WITH CHECK ((((company_id = public.current_company()) OR (public.is_super_admin() = true))));

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.push_subscriptions FORCE ROW LEVEL SECURITY;

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

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.user_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON public.user_sessions
USING (((EXISTS (
    SELECT 1
    FROM public.users u
    WHERE (u.id = user_sessions.user_id)
      AND ((u.company_id = public.current_company()) OR (public.is_super_admin() = true))
  ))))
WITH CHECK (((EXISTS (
    SELECT 1
    FROM public.users u
    WHERE (u.id = user_sessions.user_id)
      AND ((u.company_id = public.current_company()) OR (public.is_super_admin() = true))
  ))));
