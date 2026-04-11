import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../common/redis/redis.service';
import * as crypto from 'crypto';
import { getRefreshTokenSecret } from '../auth-security.config';
import { normalizeAccessTokenClaims } from '../utils/access-token-claims.util';

type RefreshCookieRequest = {
  cookies?: Record<string, string | undefined>;
};

function cookieExtractor(req?: RefreshCookieRequest): string | null {
  const refreshToken = req?.cookies?.refresh_token;
  if (typeof refreshToken === 'string' && refreshToken.length > 0) {
    return refreshToken;
  }
  return null;
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(
    private configService: ConfigService,
    private redisService: RedisService,
  ) {
    const jwtSecret = getRefreshTokenSecret(configService);
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([cookieExtractor]),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: Record<string, unknown>, token: string) {
    const normalized = normalizeAccessTokenClaims(payload);
    const client = this.redisService.getClient();
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const key = this.redisService.getRefreshTokenKey(
      normalized.userId,
      tokenHash,
    );
    const exists = await client.get(key);
    if (!exists) {
      throw new UnauthorizedException();
    }
    return {
      id: normalized.id,
      userId: normalized.userId,
      app_user_id: normalized.app_user_id,
      auth_user_id: normalized.auth_user_id,
      authUserId: normalized.auth_user_id,
      cpf: normalized.cpf,
      company_id: normalized.company_id,
      companyId: normalized.companyId,
      profile: normalized.profile,
      isSuperAdmin: normalized.isSuperAdmin,
      plan: normalized.plan,
    };
  }
}
