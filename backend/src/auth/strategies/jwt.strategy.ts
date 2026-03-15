import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TokenRevocationService } from '../token-revocation.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly tokenRevocationService: TokenRevocationService,
  ) {
    const jwtSecret = configService.get<string>('JWT_SECRET');
    if (!jwtSecret) {
      throw new Error('JWT_SECRET is required');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: {
    sub: string;
    cpf: string;
    company_id: string;
    profile: unknown;
    jti?: string;
  }) {
    // Validação defensiva: campos essenciais devem existir e ser strings não-vazias.
    // Um token válido gerado por este sistema sempre terá sub e cpf.
    // company_id pode ser ausente para o Administrador Geral — portanto opcional aqui;
    // o TenantMiddleware e TenantGuard já fazem essa checagem contextual.
    if (!payload || typeof payload.sub !== 'string' || !payload.sub) {
      throw new UnauthorizedException('Token inválido');
    }
    if (typeof payload.cpf !== 'string' || !payload.cpf) {
      throw new UnauthorizedException('Token inválido');
    }

    // Checar blacklist: tokens revogados via logout são rejeitados imediatamente,
    // sem esperar o TTL natural expirar.
    if (payload.jti && (await this.tokenRevocationService.isRevoked(payload.jti))) {
      throw new UnauthorizedException('Token revogado');
    }

    return {
      userId: payload.sub,
      cpf: payload.cpf,
      company_id: payload.company_id,
      profile: payload.profile,
    };
  }
}
