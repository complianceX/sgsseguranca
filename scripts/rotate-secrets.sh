#!/usr/bin/env bash
# =============================================================================
# SGS SEGURANCA — Script de Rotação de Secrets
# =============================================================================
# Uso: ./scripts/rotate-secrets.sh [--dry-run] [--service web|worker|all]
#
# O que faz:
#   1. Gera novos valores para JWT_SECRET, JWT_REFRESH_SECRET,
#      VALIDATION_TOKEN_SECRET e DOCUMENT_DOWNLOAD_TOKEN_SECRET
#   2. Atualiza os serviços no Render via API
#   3. Aciona redeploy dos serviços afetados
#   4. Imprime resumo de ações realizadas
#
# Pré-requisitos:
#   - RENDER_API_KEY exportada no ambiente (ou em ~/.render/cli.yaml)
#   - openssl disponível no PATH
#
# ATENÇÃO: Após a rotação, todos os JWTs existentes são invalidados.
#          Usuários serão deslogados e precisarão fazer login novamente.
# =============================================================================

set -euo pipefail

# ─── Configuração ─────────────────────────────────────────────────────────────
DRY_RUN=false
TARGET_SERVICE="all"
RENDER_API="https://api.render.com/v1"

# IDs dos serviços no Render
WEB_SERVICE_ID="srv-d75c5eea2pns73dv84rg"
WORKER_SERVICE_ID="srv-d75c5eea2pns73dv84sg"

# ─── Cores ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
log_success() { echo -e "${GREEN}[OK]${NC}   $*"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error()   { echo -e "${RED}[ERR]${NC}  $*" >&2; }

# ─── Parse de argumentos ──────────────────────────────────────────────────────
for arg in "$@"; do
  case $arg in
    --dry-run)   DRY_RUN=true ;;
    --service=*) TARGET_SERVICE="${arg#--service=}" ;;
    --help|-h)
      echo "Uso: $0 [--dry-run] [--service=web|worker|all]"
      exit 0
      ;;
    *) log_error "Argumento desconhecido: $arg"; exit 1 ;;
  esac
done

# ─── Validação de pré-requisitos ──────────────────────────────────────────────
if ! command -v openssl &>/dev/null; then
  log_error "openssl não encontrado. Instale antes de continuar."
  exit 1
fi

# Tenta obter RENDER_API_KEY do arquivo de configuração do CLI se não estiver no ambiente
if [[ -z "${RENDER_API_KEY:-}" ]]; then
  CLI_YAML="${HOME}/.render/cli.yaml"
  if [[ -f "$CLI_YAML" ]]; then
    RENDER_API_KEY=$(grep 'key:' "$CLI_YAML" | awk '{print $2}' | tr -d '"' | head -1)
  fi
fi

if [[ -z "${RENDER_API_KEY:-}" ]]; then
  log_error "RENDER_API_KEY não encontrada. Exporte-a ou faça login com 'render login'."
  exit 1
fi

# ─── Geração de secrets ───────────────────────────────────────────────────────
generate_secret() {
  openssl rand -hex 32
}

log_info "Gerando novos secrets..."
NEW_JWT_SECRET=$(generate_secret)
NEW_JWT_REFRESH_SECRET=$(generate_secret)
NEW_VALIDATION_TOKEN_SECRET=$(generate_secret)
NEW_DOCUMENT_DOWNLOAD_TOKEN_SECRET=$(generate_secret)

log_success "Secrets gerados (nunca serão exibidos novamente após este script)"

if [[ "$DRY_RUN" == "true" ]]; then
  log_warn "MODO DRY-RUN: nenhuma alteração será feita no Render."
  log_info "JWT_SECRET                    = ${NEW_JWT_SECRET:0:8}..."
  log_info "JWT_REFRESH_SECRET            = ${NEW_JWT_REFRESH_SECRET:0:8}..."
  log_info "VALIDATION_TOKEN_SECRET       = ${NEW_VALIDATION_TOKEN_SECRET:0:8}..."
  log_info "DOCUMENT_DOWNLOAD_TOKEN_SECRET= ${NEW_DOCUMENT_DOWNLOAD_TOKEN_SECRET:0:8}..."
  exit 0
fi

# ─── Função: atualizar env var no Render ──────────────────────────────────────
render_set_env() {
  local service_id="$1"
  local key="$2"
  local value="$3"

  local http_status
  http_status=$(curl -s -o /dev/null -w "%{http_code}" \
    -X PUT \
    -H "Authorization: Bearer ${RENDER_API_KEY}" \
    -H "Content-Type: application/json" \
    "${RENDER_API}/services/${service_id}/env-vars/${key}" \
    -d "{\"value\": \"${value}\"}")

  if [[ "$http_status" =~ ^2 ]]; then
    log_success "${key} atualizado no serviço ${service_id}"
  else
    log_error "Falha ao atualizar ${key} no serviço ${service_id} (HTTP ${http_status})"
    return 1
  fi
}

# ─── Função: acionar redeploy ─────────────────────────────────────────────────
render_deploy() {
  local service_id="$1"
  local service_name="$2"

  local http_status
  http_status=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST \
    -H "Authorization: Bearer ${RENDER_API_KEY}" \
    -H "Content-Type: application/json" \
    "${RENDER_API}/services/${service_id}/deploys" \
    -d '{"clearCache":"do_not_clear"}')

  if [[ "$http_status" =~ ^2 ]]; then
    log_success "Redeploy acionado para ${service_name}"
  else
    log_warn "Não foi possível acionar redeploy para ${service_name} (HTTP ${http_status}) — acione manualmente no dashboard."
  fi
}

# ─── Rotação por serviço ──────────────────────────────────────────────────────
rotate_service() {
  local service_id="$1"
  local service_name="$2"

  log_info "Rotacionando secrets em ${service_name} (${service_id})..."

  render_set_env "$service_id" "JWT_SECRET"                     "$NEW_JWT_SECRET"
  render_set_env "$service_id" "JWT_REFRESH_SECRET"             "$NEW_JWT_REFRESH_SECRET"
  render_set_env "$service_id" "VALIDATION_TOKEN_SECRET"        "$NEW_VALIDATION_TOKEN_SECRET"
  render_set_env "$service_id" "DOCUMENT_DOWNLOAD_TOKEN_SECRET" "$NEW_DOCUMENT_DOWNLOAD_TOKEN_SECRET"

  render_deploy "$service_id" "$service_name"
}

# ─── Confirmação interativa ───────────────────────────────────────────────────
echo ""
log_warn "ATENÇÃO: Esta operação irá:"
log_warn "  1. Revogar TODOS os JWTs e sessions existentes"
log_warn "  2. Forçar logout de todos os usuários autenticados"
log_warn "  3. Acionar redeploy dos serviços afetados"
echo ""
read -r -p "Deseja continuar? (digite 'SIM' para confirmar): " CONFIRM
if [[ "$CONFIRM" != "SIM" ]]; then
  log_info "Operação cancelada."
  exit 0
fi

# ─── Execução ─────────────────────────────────────────────────────────────────
case "$TARGET_SERVICE" in
  web)
    rotate_service "$WEB_SERVICE_ID" "sgs-backend-web"
    ;;
  worker)
    rotate_service "$WORKER_SERVICE_ID" "sgs-backend-worker"
    ;;
  all)
    rotate_service "$WEB_SERVICE_ID"    "sgs-backend-web"
    rotate_service "$WORKER_SERVICE_ID" "sgs-backend-worker"
    ;;
  *)
    log_error "Serviço inválido: ${TARGET_SERVICE}. Use web, worker ou all."
    exit 1
    ;;
esac

# ─── Resumo ───────────────────────────────────────────────────────────────────
echo ""
log_success "Rotação concluída em $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
log_info "Próxima rotação recomendada: $(date -u -d '+90 days' '+%Y-%m-%d' 2>/dev/null || date -u -v+90d '+%Y-%m-%d' 2>/dev/null || echo '90 dias')"
log_warn "Todos os usuários precisarão fazer login novamente."
