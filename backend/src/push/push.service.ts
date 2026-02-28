import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as webpush from 'web-push';
import { PushSubscription } from './entities/push-subscription.entity';
import { IntegrationResilienceService } from '../common/resilience/integration-resilience.service';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    @InjectRepository(PushSubscription)
    private subscriptionRepo: Repository<PushSubscription>,
    private readonly integration: IntegrationResilienceService,
  ) {
    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const mailto = process.env.VAPID_MAILTO || 'mailto:admin@example.com';

    if (vapidPublicKey && vapidPrivateKey) {
      webpush.setVapidDetails(mailto, vapidPublicKey, vapidPrivateKey);
    } else {
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
    const subscriptions = await this.subscriptionRepo.find({
      where: { userId },
    });

    const notifications = subscriptions.map((sub) =>
      this.sendNotification(sub, payload),
    );

    await Promise.all(notifications);
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
    } catch (error: unknown) {
      const pushError = error as { statusCode?: number };
      if (
        pushError &&
        typeof pushError === 'object' &&
        (pushError.statusCode === 410 || pushError.statusCode === 404)
      ) {
        // Subscription expirou, remover do BD
        await this.subscriptionRepo.delete({ endpoint: subscription.endpoint });
      } else {
        this.logger.error('Error sending push notification', error);
      }
    }
  }

  getPublicKey() {
    return { publicKey: process.env.VAPID_PUBLIC_KEY };
  }
}
