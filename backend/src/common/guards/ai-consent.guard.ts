import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConsentsService } from '../../consents/consents.service';

interface JwtUser {
  userId: string;
  [key: string]: unknown;
}

/**
 * AiConsentGuard — bloqueia endpoints de IA quando o titular não tem aceite
 * ATIVO na versão vigente do consentimento `ai_processing`.
 *
 * Migração A2 do plano de remediação LGPD: passou a delegar ao `ConsentsService`,
 * que consulta `user_consents` (com prova material de IP/UA/timestamp) em vez
 * da flag booleana legada `users.ai_processing_consent`.
 *
 * Se a versão do consentimento mudar após o aceite do usuário, o guard bloqueia
 * até que o titular re-aceite — garantia de prova válida para o texto vigente.
 *
 * Deve ser aplicado APÓS JwtAuthGuard, pois depende de request.user.
 */
@Injectable()
export class AiConsentGuard implements CanActivate {
  private readonly logger = new Logger(AiConsentGuard.name);

  constructor(private readonly consentsService: ConsentsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: JwtUser }>();
    const userId = request.user?.userId;

    if (!userId) {
      throw new ForbiddenException(
        'Consentimento para processamento por IA não verificável sem autenticação. Refaça login.',
      );
    }

    const hasConsent = await this.consentsService.hasActiveConsent(
      userId,
      'ai_processing',
    );

    if (!hasConsent) {
      this.logger.warn({
        event: 'ai_consent_denied',
        userId,
        timestamp: new Date().toISOString(),
      });

      throw new ForbiddenException(
        'Consentimento para processamento por IA não fornecido ou desatualizado. Atualize suas preferências em Configurações → Privacidade.',
      );
    }

    return true;
  }
}
