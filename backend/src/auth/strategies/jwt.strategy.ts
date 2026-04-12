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
  constructor(
    configService: ConfigService,
    private readonly tokenRevocationService: TokenRevocationService,
    private readonly authPrincipalService: AuthPrincipalService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      passReqToCallback: true,
      secretOrKeyProvider: (_request, rawJwtToken, done) => {
        try {
          const rawToken =
            typeof rawJwtToken === 'string' ? rawJwtToken : undefined;
          done(null, resolveAccessTokenSecret(configService, rawToken));
        } catch (error) {
          done(error as Error);
        }
      },
    });
  }

  async validate(
    request: AuthenticatedHttpRequest,
    payload: { jti?: string } & Record<string, unknown>,
  ) {
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
