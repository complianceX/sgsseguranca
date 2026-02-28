import { SetMetadata } from '@nestjs/common';
import { REQUEST_TIMEOUT_KEY } from '../interceptors/timeout.interceptor';

/**
 * Sobrescreve o timeout padrão (30s) para uma rota ou controller específico.
 *
 * @param ms Timeout em milissegundos
 *
 * @example
 * // Rota de geração de PDF precisa de 2 minutos
 * @RequestTimeout(120_000)
 * @Post('generate')
 * async generateReport() { ... }
 */
export const RequestTimeout = (ms: number) =>
  SetMetadata(REQUEST_TIMEOUT_KEY, ms);
