import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  SetMetadata,
  mixin,
  Type,
} from '@nestjs/common';
import { ConsentsService } from './consents.service';
import { ConsentType } from './entities/consent-version.entity';

export const REQUIRES_CONSENT_META = 'requiresConsent';

/**
 * Decorator-factory para acoplar um tipo de consentimento a um endpoint.
 * Uso:
 *
 *   @UseGuards(JwtAuthGuard, RequireConsent('ai_processing'))
 *   @Post('/ai/chat')
 *   chat() { ... }
 */
export function RequireConsent(type: ConsentType): Type<CanActivate> {
  @Injectable()
  class ConsentGuardMixin implements CanActivate {
    private readonly logger = new Logger(`ConsentGuard(${type})`);

    constructor(private readonly consentsService: ConsentsService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
      const request = context.switchToHttp().getRequest<{
        user?: { userId?: string; sub?: string };
      }>();
      const userId = request.user?.userId ?? request.user?.sub;

      if (!userId) {
        throw new ForbiddenException(
          `Consentimento '${type}' não verificável sem autenticação. Refaça login.`,
        );
      }

      const active = await this.consentsService.hasActiveConsent(userId, type);
      if (!active) {
        this.logger.warn({
          event: 'consent_denied',
          userId,
          type,
          timestamp: new Date().toISOString(),
        });
        throw new ForbiddenException(
          `Consentimento '${type}' não fornecido ou desatualizado. Atualize suas preferências em Configurações → Privacidade.`,
        );
      }

      return true;
    }
  }

  // Anota o metadado para que interceptadores possam identificar o requisito.
  SetMetadata(REQUIRES_CONSENT_META, type)(ConsentGuardMixin);
  return mixin(ConsentGuardMixin);
}
