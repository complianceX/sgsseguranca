import { RequestTimeout } from './request-timeout.decorator';

const DEFAULT_PDF_TIMEOUT_MS = 90_000;

function resolvePdfRequestTimeoutMs(): number {
  const raw = Number(process.env.PDF_REQUEST_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  return DEFAULT_PDF_TIMEOUT_MS;
}

/**
 * Timeout padrão para rotas que geram/streamam PDF sob demanda
 * (90s por default, configurável via `PDF_REQUEST_TIMEOUT_MS`).
 *
 * Use em rotas síncronas como `GET /<recurso>/:id/pdf`. Geração em fila
 * (`/generate`, `/monthly`) não precisa desse decorator, já que o response
 * HTTP retorna imediatamente com um jobId.
 *
 * @example
 * @PdfRequestTimeout()
 * @Get(':id/pdf')
 * async downloadPdf() { ... }
 */
export const PdfRequestTimeout = () =>
  RequestTimeout(resolvePdfRequestTimeoutMs());
