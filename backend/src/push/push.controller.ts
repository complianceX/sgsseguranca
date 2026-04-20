import {
  UnauthorizedException,
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  Get,
  Delete,
  Param,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { PushService } from './push.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuditAction as ForensicAuditAction } from '../common/decorators/audit-action.decorator';
import { TenantGuard } from '../common/guards/tenant.guard';
import { Authorize } from '../auth/authorize.decorator';
import { getRequestIp } from '../common/utils/request-ip.util';

interface RequestWithUser extends Request {
  user?: {
    id?: string;
    userId?: string;
    company_id?: string;
    companyId?: string;
    [key: string]: unknown;
  };
}

const isProd = process.env.NODE_ENV === 'production';
const PUSH_SUBSCRIPTION_DELETE_THROTTLE_LIMIT = Number(
  process.env.PUSH_SUBSCRIPTION_DELETE_THROTTLE_LIMIT || (isProd ? 10 : 50),
);
const PUSH_SUBSCRIPTION_DELETE_THROTTLE_TTL = Number(
  process.env.PUSH_SUBSCRIPTION_DELETE_THROTTLE_TTL || 60_000,
);

@Controller('push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Get('public-key')
  getPublicKey() {
    return this.pushService.getPublicKey();
  }

  @Post('subscribe')
  @UseGuards(JwtAuthGuard, TenantGuard)
  @Authorize('can_manage_push_subscriptions')
  async subscribe(
    @Req() req: RequestWithUser,
    @Body()
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  ) {
    const { userId, tenantId } = this.extractIdentity(req);
    await this.pushService.addSubscription({ userId, tenantId }, subscription);
    return { success: true };
  }

  @Delete('subscriptions/:encodedEndpoint')
  @UseGuards(JwtAuthGuard, TenantGuard)
  @Authorize('can_manage_push_subscriptions')
  @Throttle({
    default: {
      limit: PUSH_SUBSCRIPTION_DELETE_THROTTLE_LIMIT,
      ttl: PUSH_SUBSCRIPTION_DELETE_THROTTLE_TTL,
    },
  })
  @ForensicAuditAction('delete', 'push_subscription')
  async unsubscribe(
    @Req() req: RequestWithUser,
    @Param('encodedEndpoint') encodedEndpoint: string,
  ) {
    const { userId, tenantId } = this.extractIdentity(req);
    const endpoint = this.decodeEndpointFromPath(encodedEndpoint);
    await this.pushService.removeSubscription({
      endpoint,
      userId,
      tenantId,
      ip: getRequestIp(req),
      userAgent: String(req.headers['user-agent'] || ''),
    });
    return { success: true };
  }

  private extractIdentity(req: RequestWithUser): {
    userId: string;
    tenantId: string;
  } {
    const userId = String(req.user?.userId || req.user?.id || '').trim();
    const tenantId = String(
      req.user?.company_id || req.user?.companyId || '',
    ).trim();

    if (!userId) {
      throw new UnauthorizedException('Usuário não autenticado.');
    }
    if (!tenantId) {
      throw new UnauthorizedException(
        'Contexto de tenant ausente para operação de push.',
      );
    }

    return { userId, tenantId };
  }

  private decodeEndpointFromPath(encodedEndpoint: string): string {
    try {
      return decodeURIComponent(String(encodedEndpoint || ''));
    } catch {
      return '';
    }
  }
}
