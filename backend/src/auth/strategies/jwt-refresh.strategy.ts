import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../common/redis/redis.service';
import * as crypto from 'crypto';

function cookieExtractor(req: any): string | null {
  if (req && req.cookies && req.cookies['refresh_token']) {
    return req.cookies['refresh_token'];
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
    const jwtSecret = configService.get<string>('JWT_SECRET');
    if (!jwtSecret) {
      throw new Error('JWT_SECRET is required');
    }
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([cookieExtractor]),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(
    payload: { sub: string; cpf: string; company_id: string; profile: unknown },
    token: string,
  ) {
    const client = this.redisService.getClient();
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const key = this.redisService.getRefreshTokenKey(payload.sub, tokenHash);
    const exists = await client.get(key);
    if (!exists) {
      throw new UnauthorizedException();
    }
    return {
      userId: payload.sub,
      cpf: payload.cpf,
      company_id: payload.company_id,
      profile: payload.profile,
    };
  }
}
