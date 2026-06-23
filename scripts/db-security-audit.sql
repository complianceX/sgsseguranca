-- ============================================
-- AUDITORIA DE SEGURANÇA DO BANCO DE DADOS SGS
-- ============================================
-- Execute este script no banco de dados para verificar a postura de segurança
-- Requer: PostgreSQL 15+ com permissões de leitura em system catalogs

-- 1. VERIFICAR TABELAS SEM RLS HABILITADO
-- ========================================
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled,
    forcerowsecurity as force_rls
FROM pg_tables 
WHERE schemaname = 'public'
    AND tablename NOT LIKE 'pg_%'
    AND tablename NOT LIKE 'sql_%'
ORDER BY tablename;

-- 2. VERIFICAR POLÍTICAS RLS POR TABELA
-- ========================================
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual as using_expression,
    with_check
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 3. VERIFICAR FUNÇÕES COM SEARCH_PATH INSEGURO
-- ========================================
SELECT 
    n.nspname as schema_name,
    p.proname as function_name,
    pg_get_function_arguments(p.oid) as arguments,
    CASE 
        WHEN p.proconfig IS NULL THEN 'NÃO CONFIGURADO'
        WHEN EXISTS (
            SELECT 1 FROM unnest(p.proconfig) AS config 
            WHERE config LIKE 'search_path=%'
        ) THEN 'CONFIGURADO'
        ELSE 'NÃO CONFIGURADO'
    END as search_path_status,
    p.proconfig as config_settings
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND p.prorettype = 'pg_catalog.void'::regtype::oid
    OR p.prorettype = 'pg_catalog.text'::regtype::oid
    OR p.prorettype = 'pg_catalog.uuid'::regtype::oid
    OR p.prorettype = 'pg_catalog.boolean'::regtype::oid
ORDER BY p.proname;

-- 4. VERIFICAR GRANTS PERIGOSOS EM TABELAS PÚBLICAS
-- ========================================
SELECT 
    grantee,
    table_schema,
    table_name,
    privilege_type,
    is_grantable
FROM information_schema.table_privileges
WHERE table_schema = 'public'
    AND grantee IN ('PUBLIC', 'anon', 'authenticated')
ORDER BY table_name, grantee, privilege_type;

-- 5. VERIFICAR FUNÇÕES COM PERMISSÕES PERIGOSAS
-- ========================================
SELECT 
    n.nspname as schema_name,
    p.proname as function_name,
    pg_get_function_arguments(p.oid) as arguments,
    pg_get_function_result(p.oid) as return_type,
    CASE p.prosecdef
        WHEN true THEN 'SECURITY DEFINER'
        ELSE 'SECURITY INVOKER'
    END as security_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
    AND p.prosecdef = true
ORDER BY p.proname;

-- 6. VERIFICAR EXTENSÕES INSTALADAS
-- ========================================
SELECT 
    extname as extension_name,
    extversion as version,
    n.nspname as schema_name
FROM pg_extension e
JOIN pg_namespace n ON e.extnamespace = n.oid
ORDER BY extname;

-- 7. VERIFICAR ROLES E PERMISSÕES
-- ========================================
SELECT 
    rolname as role_name,
    rolsuper as is_superuser,
    rolinherit as inherit,
    rolcreaterole as create_role,
    rolcreatedb as create_db,
    rolcanlogin as can_login,
    rolreplication as replication,
    rolconnlimit as connection_limit,
    rolvaliduntil as valid_until
FROM pg_roles
WHERE rolname NOT LIKE 'pg_%'
    AND rolname != 'postgres'
ORDER BY rolname;

-- 8. VERIFICAR TABELAS COM DADOS SENSÍVEIS
-- ========================================
SELECT 
    table_name,
    column_name,
    data_type,
    character_maximum_length,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
    AND (
        column_name ILIKE '%cpf%'
        OR column_name ILIKE '%password%'
        OR column_name ILIKE '%secret%'
        OR column_name ILIKE '%token%'
        OR column_name ILIKE '%key%'
        OR column_name ILIKE '%medical%'
        OR column_name ILIKE '%health%'
    )
ORDER BY table_name, column_name;

-- 9. VERIFICAR TRIGGERS E FUNÇÕES DE TRIGGER
-- ========================================
SELECT 
    trigger_name,
    event_manipulation,
    event_object_schema,
    event_object_table,
    action_timing,
    action_orientation,
    action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- 10. VERIFICAR CONSTRAINTS DE INTEGRIDADE
-- ========================================
SELECT 
    tc.table_name,
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name,
    ccu.table_name as foreign_table_name,
    ccu.column_name as foreign_column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name
    AND tc.table_schema = ccu.table_schema
WHERE tc.table_schema = 'public'
    AND tc.constraint_type IN ('FOREIGN KEY', 'UNIQUE', 'CHECK')
ORDER BY tc.table_name, tc.constraint_type;

-- 11. VERIFICAR ÍNDICES E PERFORMANCE
-- ========================================
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
    AND indexname LIKE 'IDX_%'
ORDER BY tablename, indexname;

-- 12. VERIFICAR POLÍTICAS RLS COM USING TRUE (PERMISSIVAS)
-- ========================================
SELECT 
    schemaname,
    tablename,
    policyname,
    cmd,
    qual as using_expression,
    with_check
FROM pg_policies 
WHERE schemaname = 'public'
    AND qual = 'true'
    AND with_check = 'true'
ORDER BY tablename, policyname;

-- 13. VERIFICAR TABELAS SEM FOREIGN KEYS (INTEGRIDADE)
-- ========================================
SELECT 
    table_name
FROM information_schema.tables
WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
    AND table_name NOT IN (
        SELECT DISTINCT tc.table_name
        FROM information_schema.table_constraints tc
        WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_schema = 'public'
    )
ORDER BY table_name;

-- 14. VERIFICAR COLUNAS SEM ÍNDICES (PERFORMANCE)
-- ========================================
SELECT 
    c.table_name,
    c.column_name,
    c.data_type,
    c.is_nullable
FROM information_schema.columns c
LEFT JOIN information_schema.key_column_usage kcu
    ON c.table_name = kcu.table_name
    AND c.column_name = kcu.column_name
    AND c.table_schema = kcu.table_schema
WHERE c.table_schema = 'public'
    AND kcu.column_name IS NULL
    AND c.column_name IN ('company_id', 'user_id', 'created_at', 'updated_at')
ORDER BY c.table_name, c.column_name;