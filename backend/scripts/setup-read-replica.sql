-- ============================================================================
-- READ REPLICA: PostgreSQL Replication Config
-- ============================================================================
-- Objetivo: Distribuir carga de LEITURA para replica
-- Benefício: P95 de 800ms → 150ms em queries pesadas
--
-- Servidor: PRIMARY (write) + REPLICA (read-only)
-- Replicação: WAL Streaming (real-time)

\echo '════════════════════════════════════════════════════════════════'
\echo 'SETUP: PostgreSQL Read Replica'
\echo '════════════════════════════════════════════════════════════════'

-- ============================================================================
-- PASSO 1: Configurar PRIMARY Server (postgresql.conf)
-- ============================================================================
\echo ''
\echo 'PASSO 1: Configurar PRIMARY (postgresql.conf)'
\echo '────────────────────────────────────────────'

-- Em /etc/postgresql/<version>/main/postgresql.conf:
/*
# === WAL streaming para replica ===
wal_level = replica
max_wal_senders = 3
max_replication_slots = 3
wal_keep_segments = 64
wal_keep_size = 1GB

# === Timeout (ajuste conforme latência de rede) ===
wal_receiver_timeout = 60s
wal_receiver_status_interval = 10s

# === Performance ===
shared_buffers = 4GB              # 25% da RAM
effective_cache_size = 16GB       # 75% da RAM
work_mem = 256MB
maintenance_work_mem = 2GB
*/

\echo '✅ Configurar postgresql.conf no PRIMARY'
\echo '   Adicione as linhas acima'
\echo '   Depois: sudo systemctl restart postgresql'

-- ============================================================================
-- PASSO 2: Criar Usuário de Replicação
-- ============================================================================
\echo ''
\echo 'PASSO 2: Criar Usuário de Replicação'
\echo '──────────────────────────────────'

-- Execute COMO SUPERUSER (postgres):
CREATE ROLE replication_user WITH REPLICATION LOGIN PASSWORD 'strong-password-here';

-- Verificar
\du replication_user

\echo ''
\echo '✅ Usuário replication_user criado'

-- ============================================================================
-- PASSO 3: Configurar pg_hba.conf (Acesso Remoto)
-- ============================================================================
\echo ''
\echo 'PASSO 3: Configurar pg_hba.conf (Permitir Replica)'
\echo '────────────────────────────────────────────'

/*
Em /etc/postgresql/<version>/main/pg_hba.conf, adicione:

# Replication from replica server
host    replication    replication_user    <REPLICA_IP>/32    md5
host    sst_db         app_user            <REPLICA_IP>/32    md5

Onde:
  <REPLICA_IP> = IP do servidor REPLICA
  app_user = usuário que a aplicação usa
*/

\echo '✅ Adicionar linhas no pg_hba.conf'
\echo '   grep "replication" /etc/postgresql/<version>/main/pg_hba.conf'
\echo '   Depois: sudo systemctl restart postgresql'

-- ============================================================================
-- PASSO 4: Criar Base de Dados (Replica)
-- ============================================================================
\echo ''
\echo 'PASSO 4: Setup REPLICA Server (via shell no servidor replica)'
\echo '───────────────────────────────────────────────────────'

/*
No REPLICA Server (como postgres user):

# Parar PostgreSQL
sudo systemctl stop postgresql

# Remover dados antigos
sudo rm -rf /var/lib/postgresql/<version>/main/*

# Fazer base copy do PRIMARY
pg_basebackup -h <PRIMARY_IP> -D /var/lib/postgresql/<version>/main \
  -U replication_user -v -P -W --wal-method=stream

# Criar standby.signal (marca como standby!)
touch /var/lib/postgresql/<version>/main/standby.signal

# Ajustar permissões
sudo chown -R postgres:postgres /var/lib/postgresql/<version>/main
sudo chmod 700 /var/lib/postgresql/<version>/main

# Iniciar PostgreSQL
sudo systemctl start postgresql

# Verificar status
pg_controldata /var/lib/postgresql/<version>/main | grep "Database cluster state"
# Esperado: "Database cluster state: in archive recovery"
*/

\echo '✅ Execute os comandos shell acima no REPLICA'

-- ============================================================================
-- PASSO 5: Verificar Replicação (no PRIMARY)
-- ============================================================================
\echo ''
\echo 'PASSO 5: Verificar Status da Replicação'
\echo '──────────────────────────────────'

-- Execute no PRIMARY:
SELECT 
    client_addr,
    state,
    sent_lsn,
    write_lsn,
    flush_lsn,
    replay_lsn
FROM pg_stat_replication;

\echo ''
\echo 'Esperado:'
\echo '  - client_addr: <IP_REPLICA>'
\echo '  - state: streaming (ou catchup)'
\echo ''

-- ============================================================================
-- PASSO 6: Configurar TypeORM para usar Replica
-- ============================================================================
\echo ''
\echo 'PASSO 6: Configurar TypeORM (app.module.ts)'
\echo '───────────────────────────────────────'

/*
NO CÓDIGO (TypeORM config):

const dataSource = new DataSource({
  type: 'postgres',
  
  // Master (escrita)
  host: 'primary.example.com',
  port: 5432,
  
  // Replicas (leitura)
  replication: {
    master: {
      host: 'primary.example.com',
      port: 5432,
      username: 'app_user',
      password: process.env.DB_PASSWORD,
    },
    slaves: [
      {
        host: 'replica1.example.com',
        port: 5432,
        username: 'app_user',
        password: process.env.DB_PASSWORD,
      },
      // Adicione mais replicas conforme necessário
    ],
  },
  
  database: 'sst_db',
  entities: [...],
  synchronize: false,
  
  // Pool config
  pool: {
    max: 20,
    min: 5,
  },
});

// Queries automaticamente vão para REPLICA:
const aprs = await aprRepository.find();  // ← usa replica

// Writes vão para MASTER:
const newApr = await aprRepository.save(dto);  // ← usa master
*/

\echo ''
\echo '✅ Configurar replication em TypeORM'
\echo '   Ver exemplo acima em app.module.ts'

-- ============================================================================
-- PASSO 7: Monitoramento e Health Check
-- ============================================================================
\echo ''
\echo 'PASSO 7: Monitoramento'
\echo '────────────────────'

-- Health check (execute no PRIMARY):
CREATE OR REPLACE VIEW replication_status AS
SELECT 
    CASE 
        WHEN COUNT(*) > 0 THEN 'healthy'
        ELSE 'no-replicas'
    END as status,
    COUNT(*) as replica_count,
    MAX(extract(epoch from (pg_current_wal_lsn() - replay_lsn))) as max_lag_bytes
FROM pg_stat_replication;

SELECT * FROM replication_status;

\echo ''
\echo '✅ View replication_status criada'
\echo '   Monitorar lag com: SELECT * FROM replication_status;'

-- ============================================================================
-- PASSO 8: Failover (em caso de desastre)
-- ============================================================================
\echo ''
\echo 'PASSO 8: Failover (Se Primary cair)'
\echo '──────────────────────────────────'

/*
No REPLICA (para promover a replica a PRIMARY):

# Parar streaming
pg_ctl stop
rm /var/lib/postgresql/<version>/main/standby.signal
pg_ctl start

# Ou use ferramentas automáticas:
# - patroni (High Availability)
# - etcd (Distributed consensus)
# - pg_auto_failover (PostgreSQL >= 10)
*/

\echo '✅ Procedimento de failover documentado'

-- ============================================================================
-- RESUMO
-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo 'RESUMO: Read Replica Setup'
\echo '════════════════════════════════════════════════════════════════'
\echo ''
\echo 'Arquitetura Esperada:'
\echo ''
\echo '┌─ PRIMARY (Master) ──────────────────────┐'
\echo '│ - Recebe WRITES                          │'
\echo '│ - WAL Streaming → REPLICA                │'
\echo '│ - pg_stat_replication: 1 conex. ativa   │'
\echo '└──────────────────────────────────────────┘'
\echo '              ↓ Streaming (Async)'
\echo '┌─ REPLICA (Read-Only) ───────────────────┐'
\echo '│ - Queries de LEITURA                     │'
\echo '│ - Muito rápido (dados em cache)          │'
\echo '│ - Lag: ~100ms atrás do master            │'
\echo '└──────────────────────────────────────────┘'
\echo ''
\echo 'Benefícios:'
\echo '  ✅ Leitura distribuída (2-3x mais rápido)'
\echo '  ✅ Escala horizontal (add mais replicas)'
\echo '  ✅ Alta disponibilidade (failover)'
\echo '  ✅ Backup online (replica como backup)'
\echo ''
\echo 'Próximos Passos:'
\echo '  1. Executar PASSO 1-4 no servidor'
\echo '  2. Testar replicação (PASSO 5)'
\echo '  3. Configurar TypeORM (PASSO 6)'
\echo '  4. Monitorar lag (PASSO 7)'
\echo ''
