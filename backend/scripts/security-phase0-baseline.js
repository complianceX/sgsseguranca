const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

function parseBooleanFlag(value, fallback = false) {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return fallback;
}

const publicValidationRoutes = [
  'GET /public/documents/validate',
  'GET /public/checklists/validate',
  'GET /public/cats/validate',
  'GET /public/dossiers/validate',
  'GET /public/signature/verify',
  'GET /public/evidence/verify',
];

const sensitiveRoutes = [
  'POST /auth/login',
  'POST /auth/refresh',
  'POST /auth/logout',
  'GET /health/public',
  'GET /health',
];

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const isLocalRuntime = nodeEnv === 'development' || nodeEnv === 'test';

const flags = {
  NODE_ENV: nodeEnv,
  PUBLIC_VALIDATION_LEGACY_COMPAT:
    process.env.PUBLIC_VALIDATION_LEGACY_COMPAT || 'false',
  PUBLIC_VALIDATION_LOG_CONTRACT_USAGE:
    process.env.PUBLIC_VALIDATION_LOG_CONTRACT_USAGE || 'true',
  REFRESH_CSRF_ENFORCED:
    process.env.REFRESH_CSRF_ENFORCED || (isProduction ? 'true' : 'false'),
  REFRESH_CSRF_REPORT_ONLY: process.env.REFRESH_CSRF_REPORT_ONLY || 'false',
  REFRESH_THROTTLE_LIMIT: process.env.REFRESH_THROTTLE_LIMIT || 'default(5/20)',
  REFRESH_THROTTLE_TTL: process.env.REFRESH_THROTTLE_TTL || 'default(60000)',
  SECURITY_HARDENING_PHASE: process.env.SECURITY_HARDENING_PHASE || 'unset',
};

console.log('[security:phase0] Inventario de rotas publicas de validacao:');
for (const route of publicValidationRoutes) {
  console.log(` - ${route}`);
}

console.log('\n[security:phase0] Inventario de rotas sensiveis:');
for (const route of sensitiveRoutes) {
  console.log(` - ${route}`);
}

console.log('\n[security:phase0] Feature flags e controles de rollout:');
for (const [key, value] of Object.entries(flags)) {
  console.log(` - ${key}=${value}`);
}

const refreshCsrfEnforced = parseBooleanFlag(
  String(flags.REFRESH_CSRF_ENFORCED),
  isProduction,
);
const refreshCsrfReportOnly = parseBooleanFlag(
  String(flags.REFRESH_CSRF_REPORT_ONLY),
  false,
);

const securityFailures = [];
if (!isLocalRuntime) {
  if (!refreshCsrfEnforced) {
    securityFailures.push(
      'REFRESH_CSRF_ENFORCED=false fora de development/test desprotege /auth/refresh.',
    );
  }
  if (refreshCsrfReportOnly) {
    securityFailures.push(
      'REFRESH_CSRF_REPORT_ONLY=true fora de development/test mantém /auth/refresh em modo report-only.',
    );
  }
}

if (securityFailures.length > 0) {
  console.error('\n[security:phase0] FALHAS CRITICAS DE CSRF DETECTADAS:');
  for (const failure of securityFailures) {
    console.error(` - ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    '\n[security:phase0] Gate CSRF refresh: OK (enforced ativo e report-only desativado para ambiente não local).',
  );
}

console.log('\n[security:phase0] Checklist de preflight:');
console.log(' - Executar backup logico: npm run dr:backup:dry-run (ou dr:backup)');
console.log(' - Validar staging espelhado antes do corte');
console.log(' - Definir plano de rollback por fase (docs/security-hardening-rollout.md)');
