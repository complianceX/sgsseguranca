import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TokenRevocationService } from '../token-revocation.service';
import { AuthPrincipalService } from '../auth-principal.service';
import {
  resolveAccessTokenSecret,
} from '../utils/access-token-claims.util';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly tokenRevocationService: TokenRevocationService,
    private readonly authPrincipalService: AuthPrincipalService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: (_request, rawJwtToken, done) => {
        try {
          done(null, resolveAccessTokenSecret(configService, rawJwtToken));
        } catch (error) {
          done(error as Error);
        }
      },
    });
  }

  async validate(payload: { jti?: string } & Record<string, unknown>) {
    // Checar blacklist: tokens revogados via logout são rejeitados imediatamente,
    // sem esperar o TTL natural expirar.
    if (
      payload.jti &&
      (await this.tokenRevocationService.isRevoked(payload.jti))
    ) {
      throw new UnauthorizedException('Token revogado');
    }

    return this.authPrincipalService.resolveAccessPrincipal(payload);
  }
}
