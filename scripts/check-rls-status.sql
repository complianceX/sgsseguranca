-- ============================================
-- VERIFICAÇÃO RÁPIDA DE RLS - SGS
-- ============================================
-- Execute este script para verificar rapidamente o status do RLS

-- 1. TABELAS SEM RLS
SELECT 
    tablename,
    rowsecurity as rls_enabled,
    forcerowsecurity as force_rls
FROM pg_tables 
WHERE schemaname = 'public'
    AND rowsecurity = false
ORDER BY tablename;

-- 2. POLÍTICAS PERMISSIVAS (USING TRUE)
SELECT 
    tablename,
    policyname,
    cmd,
    qual as using_expression
FROM pg_policies 
WHERE schemaname = 'public'
    AND qual = 'true'
ORDER BY tablename, policyname;

-- 3. FUNÇÕES SEM SEARCH_PATH
SELECT 
    p.proname as function_name,
    CASE 
        WHEN p.proconfig IS NULL THEN 'SEM CONFIGURAÇÃO'
        WHEN EXISTS (
            SELECT 1 FROM unnest(p.proconfig) AS config 
            WHERE config LIKE 'search_path=%'
        ) THEN 'CONFIGURADO'
        ELSE 'SEM CONFIGURAÇÃO'
    END as search_path_status
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND p.proname IN (
        'current_company',
        'is_super_admin',
        'current_user_role',
        'current_site_id',
        'current_site_scope',
        'try_parse_uuid'
    )
ORDER BY p.proname;

-- 4. GRANTS PERIGOSOS
SELECT 
    grantee,
    table_name,
    privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
    AND grantee IN ('PUBLIC', 'anon')
ORDER BY table_name, grantee, privilege_type;

-- 5. ROLES COM SUPERUSER
SELECT 
    rolname as role_name,
    rolsuper as is_superuser
FROM pg_roles
WHERE rolsuper = true
    AND rolname NOT IN ('postgres', 'rds_superuser')
ORDER BY rolname;