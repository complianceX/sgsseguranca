import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as webpush from 'web-push';
import { PushSubscription } from './entities/push-subscription.entity';
import { IntegrationResilienceService } from '../common/resilience/integration-resilience.service';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly pushConfigured: boolean;

  constructor(
    @InjectRepository(PushSubscription)
    private subscriptionRepo: Repository<PushSubscription>,
    private readonly integration: IntegrationResilienceService,
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
    userId: string,
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  ) {
    const exists = await this.subscriptionRepo.findOne({
      where: { endpoint: subscription.endpoint },
    });

    if (!exists) {
      await this.subscriptionRepo.save({
        userId,
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      });
    }
  }

  async removeSubscription(endpoint: string) {
    await this.subscriptionRepo.delete({ endpoint });
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
}
