-- ============================================
-- VERIFICAÇÃO DE INTEGRIDADE DOS DADOS - SGS
-- ============================================
-- Execute este script para verificar a integridade dos dados

-- 1. TABELAS SEM FOREIGN KEYS
SELECT 
    table_name
FROM information_schema.tables
WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
    AND table_name NOT LIKE 'pg_%'
    AND table_name NOT LIKE 'sql_%'
    AND table_name NOT IN (
        SELECT DISTINCT tc.table_name
        FROM information_schema.table_constraints tc
        WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_schema = 'public'
    )
ORDER BY table_name;

-- 2. COLUNAS SEM ÍNDICES (FREQUENTES)
SELECT 
    c.table_name,
    c.column_name,
    c.data_type
FROM information_schema.columns c
LEFT JOIN information_schema.key_column_usage kcu
    ON c.table_name = kcu.table_name
    AND c.column_name = kcu.column_name
    AND c.table_schema = kcu.table_schema
WHERE c.table_schema = 'public'
    AND kcu.column_name IS NULL
    AND c.column_name IN ('company_id', 'user_id', 'created_at', 'updated_at')
ORDER BY c.table_name, c.column_name;

-- 3. TABELAS SEM UPDATED_AT
SELECT 
    table_name
FROM information_schema.tables
WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
    AND table_name NOT LIKE 'pg_%'
    AND table_name NOT IN (
        SELECT table_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
            AND column_name = 'updated_at'
    )
ORDER BY table_name;

-- 4. TABELAS SEM SOFT DELETE (deleted_at)
SELECT 
    table_name
FROM information_schema.tables
WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
    AND table_name NOT LIKE 'pg_%'
    AND table_name NOT LIKE 'sql_%'
    AND table_name NOT IN (
        SELECT table_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
            AND column_name = 'deleted_at'
    )
    AND table_name IN (
        SELECT table_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
            AND column_name = 'company_id'
    )
ORDER BY table_name;

-- 5. CONSTRAINTS DE CHECK
SELECT 
    tc.table_name,
    tc.constraint_name,
    cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc
    ON tc.constraint_name = cc.constraint_name
    AND tc.table_schema = cc.constraint_schema
WHERE tc.table_schema = 'public'
    AND tc.constraint_type = 'CHECK'
ORDER BY tc.table_name, tc.constraint_name;

-- 6. ÍNDICES DUPLICADOS
SELECT 
    indexname,
    tablename,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
    AND indexname LIKE 'IDX_%'
ORDER BY tablename, indexname;

-- 7. TABELAS SEM PRIMARY KEY
SELECT 
    table_name
FROM information_schema.tables
WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
    AND table_name NOT LIKE 'pg_%'
    AND table_name NOT LIKE 'sql_%'
    AND table_name NOT IN (
        SELECT tc.table_name
        FROM information_schema.table_constraints tc
        WHERE tc.constraint_type = 'PRIMARY KEY'
            AND tc.table_schema = 'public'
    )
ORDER BY table_name;

-- 8. COLUNAS UUID SEM DEFAULT
SELECT 
    table_name,
    column_name
FROM information_schema.columns
WHERE table_schema = 'public'
    AND data_type = 'uuid'
    AND column_default IS NULL
    AND is_nullable = 'NO'
ORDER BY table_name, column_name;