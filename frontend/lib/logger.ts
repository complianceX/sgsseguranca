/**
 * Logger utilitário para o frontend
 * Em produção, console.log/info/debug são suprimidos para performance e segurança
 * Erros (error/warn) são mantidos para debugging crítico
 */

const isDev = process.env.NODE_ENV === 'development';

const LOG_PREFIX = '[SGS]';

export const logger = {
  /** Log apenas em desenvolvimento */
  log: (...args: unknown[]) => {
    if (isDev) {
      console.log(LOG_PREFIX, ...args);
    }
  },

  /** Warn sempre visível (produção e dev) */
  warn: (...args: unknown[]) => {
    console.warn(LOG_PREFIX, ...args);
  },

  /** Error sempre visível (produção e dev) */
  error: (...args: unknown[]) => {
    console.error(LOG_PREFIX, ...args);
  },

  /** Info apenas em desenvolvimento */
  info: (...args: unknown[]) => {
    if (isDev) {
      console.info(LOG_PREFIX, ...args);
    }
  },

  /** Debug apenas em desenvolvimento */
  debug: (...args: unknown[]) => {
    if (isDev) {
      console.debug(LOG_PREFIX, ...args);
    }
  },
} as const;

/**
 * Helper para verificar se deve logar
 * Útil para evitar cálculos desnecessários
 */
export const shouldLog = isDev;
