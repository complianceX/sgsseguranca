#!/bin/bash

# Performance Check Script
# Analyzes database performance and suggests optimizations

set -e

echo "🔍 Performance Analysis"
echo "======================"
echo ""

# Database connection
DB_HOST=${DATABASE_HOST:-localhost}
DB_PORT=${DATABASE_PORT:-5432}
DB_NAME=${DATABASE_NAME:-sst}
DB_USER=${DATABASE_USER:-sst_user}

echo "📊 Analyzing database performance..."
echo ""

# Check for missing indexes
echo "1. Checking for missing indexes..."
PGPASSWORD=$DATABASE_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME << 'EOF'
SELECT 
  schemaname,
  tablename,
  attname,
  n_distinct,
  correlation
FROM pg_stats
WHERE schemaname = 'public'
  AND n_distinct > 100
  AND correlation < 0.1
ORDER BY n_distinct DESC
LIMIT 10;
EOF

echo ""
echo "2. Checking slow queries..."
PGPASSWORD=$DATABASE_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME << 'EOF'
SELECT 
  query,
  calls,
  total_time,
  mean_time,
  max_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
EOF

echo ""
echo "3. Checking table sizes..."
PGPASSWORD=$DATABASE_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME << 'EOF'
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 10;
EOF

echo ""
echo "4. Checking index usage..."
PGPASSWORD=$DATABASE_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME << 'EOF'
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC
LIMIT 10;
EOF

echo ""
echo "5. Checking cache hit ratio..."
PGPASSWORD=$DATABASE_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME << 'EOF'
SELECT 
  sum(heap_blks_read) as heap_read,
  sum(heap_blks_hit) as heap_hit,
  sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)) as ratio
FROM pg_statio_user_tables;
EOF

echo ""
echo "✅ Performance analysis complete!"
echo ""
echo "💡 Recommendations:"
echo "- Cache hit ratio should be > 0.99"
echo "- Unused indexes should be dropped"
echo "- Slow queries should be optimized"
echo "- Large tables should be partitioned"
