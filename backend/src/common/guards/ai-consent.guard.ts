import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';

/** Tipagem mínima do payload JWT populado pelo JwtAuthGuard. */
interface JwtUser {
  userId: string;
  [key: string]: unknown;
}

/**
 * AiConsentGuard — bloqueia acesso a endpoints de IA quando o usuário
 * ainda não deu consentimento explícito para processamento por IA (LGPD).
 *
 * Deve ser aplicado APÓS JwtAuthGuard, pois depende de request.user.
 * Retorna 403 com mensagem orientando o usuário a atualizar suas preferências.
 */
@Injectable()
export class AiConsentGuard implements CanActivate {
  private readonly logger = new Logger(AiConsentGuard.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: JwtUser }>();
    const userId = request.user?.userId;

    if (!userId) {
      // JwtAuthGuard já deve ter bloqueado antes; por segurança, bloqueia aqui também
      throw new ForbiddenException(
        'Consentimento para processamento por IA não fornecido. Faça login novamente.',
      );
    }

    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: ['id', 'ai_processing_consent'],
    });

    if (!user?.ai_processing_consent) {
      this.logger.warn({
        event: 'ai_consent_denied',
        userId,
        timestamp: new Date().toISOString(),
      });

      throw new ForbiddenException(
        'Consentimento para processamento por IA não fornecido. Atualize suas preferências em Configurações.',
      );
    }

    return true;
  }
}
