import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

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
    return Promise.resolve((req.ip as string) || '');
  }
}
