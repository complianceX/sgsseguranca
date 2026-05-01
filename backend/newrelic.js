'use strict';

/**
 * New Relic agent configuration.
 *
 * ATIVAÇÃO:
 *   1. Defina as variáveis de ambiente no Render (ou .env local):
 *        NEW_RELIC_LICENSE_KEY=<sua-license-key>
 *        NEW_RELIC_APP_NAME=sgs-backend-web
 *        NEW_RELIC_ENABLED=true
 *   2. O agente é carregado no bootstrap apenas quando NEW_RELIC_ENABLED=true.
 *      Não há impacto em produção sem a license key configurada.
 *
 * IMPORTANTE: Este arquivo deve permanecer em backend/newrelic.js (raiz do pacote).
 * O agente do New Relic exige que newrelic.js esteja no diretório de trabalho
 * ou seja carregado via --require antes de qualquer outro módulo.
 */

exports.config = {
  /**
   * Array of application names. Separates data per environment in NR UI.
   * Use NEW_RELIC_APP_NAME env var to override per environment.
   */
  app_name: [process.env.NEW_RELIC_APP_NAME || 'wanderson-gandra-backend'],

  /**
   * License key — obrigatório para envio de dados.
   * Nunca commite a license key real; use variável de ambiente.
   */
  license_key: process.env.NEW_RELIC_LICENSE_KEY || '',

  /**
   * Habilita ou desabilita o agente completamente.
   * Controlado por NEW_RELIC_ENABLED=true no ambiente.
   */
  agent_enabled: process.env.NEW_RELIC_ENABLED === 'true',

  /**
   * Logging do próprio agente New Relic (não afeta Winston).
   * 'info' em produção; 'debug' apenas para diagnóstico temporário.
   */
  logging: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'warn',
    filepath: 'stdout',
  },

  /**
   * Distributed tracing — habilita rastreamento entre serviços (API ↔ Worker).
   */
  distributed_tracing: {
    enabled: true,
  },

  /**
   * Captura de erros: envia exceções não tratadas para Error Analytics.
   */
  error_collector: {
    enabled: true,
    ignore_status_codes: [401, 403, 404, 422, 429],
  },

  /**
   * Transaction tracer: registra transações lentas (threshold padrão: 4× apdex_t).
   */
  transaction_tracer: {
    enabled: true,
    transaction_threshold: 'apdex_f',
    record_sql: process.env.NODE_ENV === 'production' ? 'obfuscated' : 'raw',
    explain_threshold: 500,
  },

  /**
   * Slow query logging: captura queries SQL > 500ms.
   */
  slow_sql: {
    enabled: true,
    max_samples: 10,
  },

  /**
   * Atributos customizados: permite enviar company_id como atributo de request
   * via newrelic.addCustomAttribute() no middleware ou guards.
   */
  attributes: {
    enabled: true,
    include: ['request.headers.x-company-id', 'request.headers.x-request-id'],
    exclude: [
      'request.headers.cookie',
      'request.headers.authorization',
      'request.parameters.*password*',
      'request.parameters.*cpf*',
    ],
  },

  /**
   * Segurança: nunca captura dados sensíveis.
   */
  strip_exception_messages: {
    enabled: process.env.NODE_ENV === 'production',
  },
};
