-- ============================================================================
-- SGS SEGURANCA - FIX: monthly_snapshots RLS policy
-- ============================================================================
-- Problema: migration 20260403133000 ativou FORCE ROW LEVEL SECURITY na tabela
-- monthly_snapshots mas não criou nenhuma policy, resultando em DENY ALL para
-- o role da aplicação (não-superuser). Queries do backend retornavam 0 rows
-- silenciosamente, quebrando dashboards de snapshots mensais.
--
-- Fix: adicionar tenant_isolation_policy equivalente às demais tabelas sensíveis.
-- ============================================================================

CREATE POLICY tenant_isolation_policy ON public.monthly_snapshots
  USING (
    (company_id = public.current_company())
    OR (public.is_super_admin() = true)
  )
  WITH CHECK (
    (company_id = public.current_company())
    OR (public.is_super_admin() = true)
  );
