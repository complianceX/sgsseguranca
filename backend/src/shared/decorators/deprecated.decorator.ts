import { applyDecorators, Header } from '@nestjs/common';

export interface DeprecatedOptions {
  /**
   * Data HTTP válida (RFC 9111) marcando quando o endpoint deixa de existir.
   * @example 'Tue, 30 Jun 2026 00:00:00 GMT'
   */
  sunset: string;
  /** Mensagem técnica para o header `Warning` (código 299). */
  message: string;
  /** Caminho/URL de migração sugerido (aparece no header `Link rel="successor-version"`). */
  successorPath?: string;
}

/**
 * Marca um endpoint como deprecated, aplicando os headers HTTP padrão:
 *   - `Deprecation: true`
 *   - `Sunset: <data>`
 *   - `Warning: 299 - "<mensagem>"`
 *   - `Link: <successor>; rel="successor-version"` (opcional)
 *
 * @example
 * @Deprecated({
 *   sunset: 'Tue, 30 Jun 2026 00:00:00 GMT',
 *   message: 'POST /aprs/:id/approve foi substituído por PATCH /aprs/:id/approve',
 *   successorPath: '/v1/aprs/:id/approve',
 * })
 * @Post(':id/approve')
 * approveLegacy() { ... }
 */
export const Deprecated = (options: DeprecatedOptions) => {
  const decorators = [
    Header('Deprecation', 'true'),
    Header('Sunset', options.sunset),
    Header('Warning', `299 - "${options.message.replace(/"/g, '\\"')}"`),
  ];

  if (options.successorPath) {
    decorators.push(
      Header('Link', `<${options.successorPath}>; rel="successor-version"`),
    );
  }

  return applyDecorators(...decorators);
};
