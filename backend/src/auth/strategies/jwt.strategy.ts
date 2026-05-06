import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { TokenRevocationService } from '../token-revocation.service';
import { AuthPrincipalService } from '../auth-principal.service';
import { resolveAccessTokenSecret } from '../utils/access-token-claims.util';
import type { AuthenticatedPrincipal } from '../auth-principal.service';

type AuthenticatedHttpRequest = Request & {
  authPrincipal?: AuthenticatedPrincipal;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly jwtIssuer: string | undefined;
  private readonly jwtAudience: string | undefined;

  constructor(
    private readonly configService: ConfigService,
    private readonly tokenRevocationService: TokenRevocationService,
    private readonly authPrincipalService: AuthPrincipalService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      passReqToCallback: true,
      secretOrKeyProvider: (_request, _rawJwtToken, done) => {
        try {
          done(null, resolveAccessTokenSecret(configService));
        } catch (error) {
          done(error as Error);
        }
      },
    });

    this.jwtIssuer =
      configService.get<string>('JWT_ISSUER')?.trim() || undefined;
    this.jwtAudience =
      configService.get<string>('JWT_AUDIENCE')?.trim() || undefined;
  }

  async validate(
    request: AuthenticatedHttpRequest,
    payload: { jti?: string; iss?: string; aud?: string | string[] } & Record<
      string,
      unknown
    >,
  ) {
    // Validação de issuer e audience — ativada quando JWT_ISSUER / JWT_AUDIENCE estão configurados.
    if (this.jwtIssuer && payload.iss !== this.jwtIssuer) {
      throw new UnauthorizedException(
        'Token inválido: emissor não reconhecido',
      );
    }

    if (this.jwtAudience) {
      const aud = payload.aud;
      const audiences = Array.isArray(aud) ? aud : aud ? [aud] : [];
      if (!audiences.includes(this.jwtAudience)) {
        throw new UnauthorizedException('Token inválido: audience incorreta');
      }
    }

    // Checar blacklist: tokens revogados via logout são rejeitados imediatamente,
    // sem esperar o TTL natural expirar.
    if (
      payload.jti &&
      (await this.tokenRevocationService.isRevoked(payload.jti))
    ) {
      throw new UnauthorizedException('Token revogado');
    }

    const cachedPrincipal = request.authPrincipal;
    if (
      cachedPrincipal &&
      this.matchesResolvedPrincipal(cachedPrincipal, payload)
    ) {
      return cachedPrincipal;
    }

    return this.authPrincipalService.resolveAccessPrincipal(payload);
  }

  private matchesResolvedPrincipal(
    principal: AuthenticatedPrincipal,
    payload: Record<string, unknown>,
  ): boolean {
    const subject = this.readString(payload, 'sub');
    if (!subject) {
      return false;
    }

    return principal.userId === subject || principal.authUserId === subject;
  }

  private readString(
    source: Record<string, unknown> | null | undefined,
    key: string,
  ): string | undefined {
    const value = source?.[key];
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
}
