import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as webpush from 'web-push';
import * as crypto from 'crypto';
import { PushSubscription } from './entities/push-subscription.entity';
import { IntegrationResilienceService } from '../common/resilience/integration-resilience.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';

type PushSubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

type PushSubscriptionOwner = {
  userId: string;
  tenantId: string;
};

type PushRemovalContext = PushSubscriptionOwner & {
  endpoint: string;
  ip?: string | null;
  userAgent?: string | null;
};

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly pushConfigured: boolean;

  constructor(
    @InjectRepository(PushSubscription)
    private subscriptionRepo: Repository<PushSubscription>,
    private readonly integration: IntegrationResilienceService,
    private readonly auditService: AuditService,
  ) {
    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const mailto = process.env.VAPID_MAILTO || 'mailto:admin@example.com';
    if (vapidPublicKey && vapidPrivateKey) {
      this.pushConfigured = true;
      webpush.setVapidDetails(mailto, vapidPublicKey, vapidPrivateKey);
    } else {
      this.pushConfigured = false;
      this.logger.warn('VAPID keys not configured. Web Push will not work.');
    }
  }

  async addSubscription(
    owner: PushSubscriptionOwner,
    subscription: PushSubscriptionInput,
  ) {
    const endpoint = this.normalizeEndpoint(subscription.endpoint);
    const exists = await this.subscriptionRepo.findOne({
      where: { endpoint },
    });

    if (!exists) {
      await this.subscriptionRepo.save({
        userId: owner.userId,
        tenantId: owner.tenantId,
        endpoint,
        keys: subscription.keys,
      });
      return;
    }

    if (exists.userId === owner.userId && exists.tenantId === owner.tenantId) {
      // Atualiza chaves para manter assinatura válida após rotação no navegador.
      exists.keys = subscription.keys;
      await this.subscriptionRepo.save(exists);
      return;
    }

    this.logger.warn({
      event: 'push_subscription_claim_denied',
      endpointHash: this.hashEndpoint(endpoint),
      ownerUserId: owner.userId,
      ownerTenantId: owner.tenantId,
      currentUserId: exists.userId,
      currentTenantId: exists.tenantId,
    });
  }

  async removeSubscription(input: PushRemovalContext) {
    const endpoint = this.normalizeEndpoint(input.endpoint);
    const owned = await this.subscriptionRepo.findOne({
      where: {
        endpoint,
        userId: input.userId,
        tenantId: input.tenantId,
      },
    });

    if (!owned) {
      const existing = await this.subscriptionRepo.findOne({
        where: { endpoint },
      });
      this.logger.warn({
        event: 'push_subscription_remove_denied',
        endpointHash: this.hashEndpoint(endpoint),
        actorUserId: input.userId,
        actorTenantId: input.tenantId,
        reason: existing ? 'not_owner_or_cross_tenant' : 'not_found',
      });
      throw new NotFoundException('Subscription não encontrada.');
    }

    await this.subscriptionRepo.delete({ id: owned.id });

    await this.auditService.log({
      userId: input.userId,
      companyId: input.tenantId,
      action: AuditAction.DELETE,
      entity: 'push_subscription',
      entityId: owned.id,
      ip: String(input.ip || 'unknown'),
      userAgent: String(input.userAgent || '').slice(0, 255) || undefined,
      changes: {
        before: {
          endpoint: owned.endpoint,
          tenantId: owned.tenantId,
          userId: owned.userId,
        },
        after: null,
      },
    });

    this.logger.log({
      event: 'push_subscription_removed',
      endpointHash: this.hashEndpoint(endpoint),
      actorUserId: input.userId,
      actorTenantId: input.tenantId,
      subscriptionId: owned.id,
    });
  }

  async sendNotificationToUser(userId: string, payload: unknown) {
    if (!this.pushConfigured) {
      this.logger.warn({
        event: 'push_notification_skipped',
        userId,
        reason: 'PUSH_NOT_CONFIGURED',
      });
      return {
        delivered: 0,
        failed: 0,
        removedSubscriptions: 0,
        skipped: true,
      };
    }

    const subscriptions = await this.subscriptionRepo.find({
      where: { userId },
    });

    const notifications = subscriptions.map((sub) =>
      this.sendNotification(sub, payload),
    );

    const results = await Promise.allSettled(notifications);
    let delivered = 0;
    let failed = 0;
    let removedSubscriptions = 0;

    for (const result of results) {
      if (result.status === 'fulfilled') {
        delivered += result.value.delivered ? 1 : 0;
        removedSubscriptions += result.value.removed ? 1 : 0;
        failed += result.value.delivered ? 0 : 1;
      } else {
        failed += 1;
      }
    }

    if (failed > 0) {
      this.logger.warn({
        event: 'push_notification_partial_failure',
        userId,
        delivered,
        failed,
        removedSubscriptions,
      });
    }

    return {
      delivered,
      failed,
      removedSubscriptions,
      skipped: false,
    };
  }

  async sendNotification(subscription: PushSubscription, payload: unknown) {
    try {
      await this.integration.execute(
        'webpush',
        () =>
          webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: subscription.keys,
            },
            JSON.stringify(payload),
          ),
        {
          timeoutMs: 10_000,
          retry: { attempts: 2, mode: 'safe' },
        },
      );
      return { delivered: true, removed: false };
    } catch (error: unknown) {
      const pushError = error as { statusCode?: number };
      if (
        pushError &&
        typeof pushError === 'object' &&
        (pushError.statusCode === 410 || pushError.statusCode === 404)
      ) {
        try {
          await this.subscriptionRepo.delete({
            endpoint: subscription.endpoint,
          });
        } catch (deleteError) {
          this.logger.warn({
            event: 'push_subscription_cleanup_failed',
            endpoint: subscription.endpoint,
            error:
              deleteError instanceof Error
                ? deleteError.message
                : String(deleteError),
          });
        }
        return { delivered: false, removed: true };
      } else {
        this.logger.error(
          {
            event: 'push_notification_failed',
            endpoint: subscription.endpoint,
            error: error instanceof Error ? error.message : String(error),
          },
          error instanceof Error ? error.stack : undefined,
        );
      }

      return { delivered: false, removed: false };
    }
  }

  getPublicKey() {
    return { publicKey: process.env.VAPID_PUBLIC_KEY };
  }

  private normalizeEndpoint(endpoint: string): string {
    const value = String(endpoint || '').trim();
    if (!value) {
      throw new BadRequestException('Endpoint de push inválido.');
    }

    return value;
  }

  private hashEndpoint(endpoint: string): string {
    return crypto.createHash('sha256').update(endpoint).digest('hex');
  }
}
