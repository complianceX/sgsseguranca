import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import * as crypto from 'crypto';

@Injectable()
export class IpThrottlerGuard extends ThrottlerGuard {
  async canActivate(context: Parameters<ThrottlerGuard['canActivate']>[0]) {
    const http = context.switchToHttp();
    const req = http.getRequest<Record<string, any>>();
    const path = String(req?.path || req?.url || '');
    const isDev = process.env.NODE_ENV !== 'production';
    const disableLoginThrottleInDev =
      process.env.DISABLE_LOGIN_THROTTLE_IN_DEV === 'true';

    // Em desenvolvimento, permite desabilitar throttle de login explicitamente.
    // Nunca dependa disso em ambientes expostos.
    if (isDev && disableLoginThrottleInDev && path.startsWith('/auth/login')) {
      return true;
    }

    return super.canActivate(context);
  }

  protected getTracker(req: Record<string, any>): Promise<string> {
    const ip = String(req.ip || '');
    const path = String(req.path || req.url || '');
    const userAgent = String(req.headers?.['user-agent'] || '').slice(0, 200);
    const fingerprint = String(req.headers?.['x-client-fingerprint'] || '')
      .trim()
      .slice(0, 120);

    const includeFingerprint =
      path.startsWith('/public/') ||
      path.startsWith('/auth/login') ||
      path.startsWith('/auth/refresh');

    if (!includeFingerprint) {
      return Promise.resolve(ip);
    }

    const source = `${userAgent}:${fingerprint}`;
    const hashed = crypto
      .createHash('sha256')
      .update(source)
      .digest('hex')
      .slice(0, 16);
    return Promise.resolve(`${ip}:${hashed}`);
  }
}
