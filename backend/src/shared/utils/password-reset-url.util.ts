import { ConfigService } from '@nestjs/config';

/**
 * Base da API pública usada para links de redefinição de senha (hash fragment).
 * A página `/auth/reset-password` é servida pelo backend, não pelo frontend —
 * por isso nunca usar FRONTEND_URL diretamente aqui.
 */
export function resolvePasswordResetBaseUrl(
  configService: ConfigService,
): string {
  const explicitApiUrl = configService.get<string>('API_PUBLIC_URL')?.trim();
  if (explicitApiUrl) {
    return explicitApiUrl.replace(/\/$/, '');
  }

  const frontendUrl = configService.get<string>('FRONTEND_URL')?.trim();
  if (frontendUrl) {
    try {
      const parsed = new URL(frontendUrl);
      parsed.hostname = parsed.hostname.replace(/^app\./i, 'api.');
      return parsed.toString().replace(/\/$/, '');
    } catch {
      return frontendUrl.replace(/\/$/, '');
    }
  }

  return 'http://localhost:3001';
}
