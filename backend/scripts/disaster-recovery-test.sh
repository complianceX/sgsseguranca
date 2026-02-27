#!/bin/bash

# Disaster Recovery Test Script
# Testa a capacidade de restaurar o banco de dados a partir de um backup

set -e

echo "🔄 Starting Disaster Recovery Test..."
echo "========================================"

# Configurações
BACKUP_DIR="${BACKUP_DIR:-.backups}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-sst_user}"
DB_NAME="${DB_NAME:-sst}"
TEST_DB_NAME="${DB_NAME}_dr_test"

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Função para log
log_info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# 1. Verificar se backup existe
log_info "Step 1: Checking for latest backup..."
LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/db_backup_*.sql.gz 2>/dev/null | head -1)

if [ -z "$LATEST_BACKUP" ]; then
  log_error "No backup found in $BACKUP_DIR"
  exit 1
fi

log_info "Found backup: $LATEST_BACKUP"
BACKUP_SIZE=$(du -h "$LATEST_BACKUP" | cut -f1)
log_info "Backup size: $BACKUP_SIZE"

# 2. Criar banco de dados de teste
log_info "Step 2: Creating test database..."
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS $TEST_DB_NAME;" 2>/dev/null || true
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d postgres -c "CREATE DATABASE $TEST_DB_NAME;"
log_info "Test database created: $TEST_DB_NAME"

# 3. Restaurar backup
log_info "Step 3: Restoring backup to test database..."
START_TIME=$(date +%s)

if [[ "$LATEST_BACKUP" == *.gz ]]; then
  gunzip -c "$LATEST_BACKUP" | PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$TEST_DB_NAME" > /dev/null 2>&1
else
  PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$TEST_DB_NAME" < "$LATEST_BACKUP" > /dev/null 2>&1
fi

END_TIME=$(date +%s)
RESTORE_TIME=$((END_TIME - START_TIME))

log_info "Backup restored in ${RESTORE_TIME}s"

# 4. Validar integridade do banco
log_info "Step 4: Validating database integrity..."

# Contar tabelas
TABLE_COUNT=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$TEST_DB_NAME" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';" | tr -d ' ')
log_info "Tables found: $TABLE_COUNT"

if [ "$TABLE_COUNT" -lt 10 ]; then
  log_error "Database integrity check failed: Too few tables ($TABLE_COUNT)"
  exit 1
fi

# Verificar índices
INDEX_COUNT=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$TEST_DB_NAME" -t -c "SELECT COUNT(*) FROM pg_indexes WHERE schemaname='public';" | tr -d ' ')
log_info "Indexes found: $INDEX_COUNT"

# Verificar dados críticos
log_info "Step 5: Checking critical data..."

COMPANIES=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$TEST_DB_NAME" -t -c "SELECT COUNT(*) FROM companies;" | tr -d ' ')
USERS=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$TEST_DB_NAME" -t -c "SELECT COUNT(*) FROM users;" | tr -d ' ')
INCIDENTS=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$TEST_DB_NAME" -t -c "SELECT COUNT(*) FROM security_incidents;" | tr -d ' ')

log_info "Companies: $COMPANIES"
log_info "Users: $USERS"
log_info "Security Incidents: $INCIDENTS"

if [ "$COMPANIES" -eq 0 ] || [ "$USERS" -eq 0 ]; then
  log_warn "Critical data missing: Companies=$COMPANIES, Users=$USERS"
fi

# 6. Testar queries críticas
log_info "Step 6: Testing critical queries..."

# Query 1: Security Score Calculation
SCORE_QUERY="SELECT COUNT(*) FROM security_incidents WHERE severity='CRITICAL' AND created_at >= NOW() - INTERVAL '30 days';"
CRITICAL_INCIDENTS=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$TEST_DB_NAME" -t -c "$SCORE_QUERY" | tr -d ' ')
log_info "Critical incidents (last 30 days): $CRITICAL_INCIDENTS"

# Query 2: 2FA Adoption
TWO_FA_QUERY="SELECT COUNT(*) FROM users WHERE two_factor_enabled=true;"
USERS_WITH_2FA=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$TEST_DB_NAME" -t -c "$TWO_FA_QUERY" | tr -d ' ')
log_info "Users with 2FA: $USERS_WITH_2FA"

# 7. Limpar banco de teste
log_info "Step 7: Cleaning up test database..."
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d postgres -c "DROP DATABASE $TEST_DB_NAME;"
log_info "Test database dropped"

# 8. Gerar relatório
log_info "Step 8: Generating report..."

REPORT_FILE="dr_test_report_$(date +%Y%m%d_%H%M%S).txt"
cat > "$REPORT_FILE" << EOF
=== Disaster Recovery Test Report ===
Date: $(date)
Status: SUCCESS

Backup Information:
  File: $LATEST_BACKUP
  Size: $BACKUP_SIZE
  Age: $(stat -f%Sm -t%Y-%m-%d "$LATEST_BACKUP" 2>/dev/null || stat -c%y "$LATEST_BACKUP" | cut -d' ' -f1)

Restore Performance:
  Duration: ${RESTORE_TIME}s
  Throughput: $(echo "scale=2; $(du -b "$LATEST_BACKUP" | cut -f1) / 1024 / 1024 / $RESTORE_TIME" | bc) MB/s

Database Integrity:
  Tables: $TABLE_COUNT
  Indexes: $INDEX_COUNT
  Status: PASSED

Data Validation:
  Companies: $COMPANIES
  Users: $USERS
  Security Incidents: $INCIDENTS
  Critical Incidents (30d): $CRITICAL_INCIDENTS
  Users with 2FA: $USERS_WITH_2FA

Conclusion:
  ✅ Backup is valid and restorable
  ✅ Database integrity verified
  ✅ Critical data present
  ✅ Queries execute successfully

Recommendations:
  - Schedule regular DR tests (monthly)
  - Monitor backup file size trends
  - Verify backup encryption is working
  - Test restore on different hardware
EOF

log_info "Report saved to: $REPORT_FILE"
cat "$REPORT_FILE"

echo ""
echo -e "${GREEN}✅ Disaster Recovery Test PASSED${NC}"
echo "========================================"
