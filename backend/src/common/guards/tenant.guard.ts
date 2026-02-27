import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

/**
 * Este guard verifica se o header 'x-company-id' corresponde ao
 * companyId presente no token de autenticação do usuário.
 * Deve ser usado após o AuthGuard.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user; // Assumindo que o AuthGuard anexa o payload do token em `request.user`
    const headerCompanyId = request.headers['x-company-id'];

    // Se não houver usuário autenticado ou ele não pertencer a uma empresa, o guard não se aplica.
    if (!user || !user.companyId) {
      return true;
    }

    // Se o header for obrigatório e não for fornecido, recusa a requisição.
    if (!headerCompanyId) {
      throw new ForbiddenException('Header x-company-id is missing.');
    }

    // Compara o ID da empresa do token com o do header.
    if (user.companyId !== headerCompanyId) {
      throw new ForbiddenException(
        'Tenant ID mismatch between token and header.',
      );
    }

    return true;
  }
}
