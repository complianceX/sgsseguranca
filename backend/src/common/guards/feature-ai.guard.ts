import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';

/**
 * Feature flag para desativar completamente IA no ambiente.
 *
 * Quando FEATURE_AI_ENABLED != 'true', as rotas protegidas retornam 404
 * (evita expor endpoints "fantasma" e reduz superfície de ataque).
 */
@Injectable()
export class FeatureAiGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    const enabled = (process.env.FEATURE_AI_ENABLED || '').trim().toLowerCase() === 'true';
    if (!enabled) {
      throw new NotFoundException();
    }
    return true;
  }
}

