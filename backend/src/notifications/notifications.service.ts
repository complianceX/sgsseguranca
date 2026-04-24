import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationsGateway } from './notifications.gateway';
import { TenantService } from '../common/tenant/tenant.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  private toGatewayPayload(
    notification: Notification,
  ): Record<string, unknown> {
    return {
      id: notification.id,
      company_id: notification.company_id,
      userId: notification.userId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      data: notification.data,
      read: notification.read,
      createdAt: notification.createdAt,
      readAt: notification.readAt,
    };
  }

  constructor(
    @InjectRepository(Notification)
    private repo: Repository<Notification>,
    private gateway: NotificationsGateway,
    private readonly tenantService: TenantService,
  ) {}

  async create(data: {
    companyId: string;
    userId: string;
    type: string;
    title: string;
    message: string;
    data?: Record<string, unknown>;
  }) {
    const notification = await this.tenantService.run(
      {
        companyId: data.companyId,
        isSuperAdmin: false,
        userId: data.userId,
        siteScope: 'all',
      },
      () =>
        this.repo.save({
          company_id: data.companyId,
          userId: data.userId,
          type: data.type,
          title: data.title,
          message: data.message,
          data: data.data,
        }),
    );

    try {
      this.gateway.sendToUser(
        data.userId,
        'notification',
        this.toGatewayPayload(notification),
      );
    } catch (error) {
      this.logger.warn({
        event: 'notification_realtime_delivery_failed',
        userId: data.userId,
        notificationId: notification.id,
        type: data.type,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return notification;
  }

  async createDeduped(data: {
    companyId: string;
    userId: string;
    type: string;
    title: string;
    message: string;
    data?: Record<string, unknown>;
    dedupeWindowMinutes?: number;
  }) {
    const dedupeWindowMinutes = Math.max(1, data.dedupeWindowMinutes ?? 360);
    const dedupeThreshold = new Date(
      Date.now() - dedupeWindowMinutes * 60 * 1000,
    );

    const existing = await this.tenantService.run(
      {
        companyId: data.companyId,
        isSuperAdmin: false,
        userId: data.userId,
        siteScope: 'all',
      },
      () =>
        this.repo.findOne({
          where: {
            company_id: data.companyId,
            userId: data.userId,
            type: data.type,
            title: data.title,
            createdAt: MoreThanOrEqual(dedupeThreshold),
          },
          order: {
            createdAt: 'DESC',
          },
        }),
    );

    if (existing) {
      return existing;
    }

    return this.create(data);
  }

  async markAsRead(id: string, userId: string, companyId: string) {
    await this.tenantService.run(
      { companyId, isSuperAdmin: false, userId, siteScope: 'all' },
      () =>
        this.repo.update(
          { id, userId, company_id: companyId },
          { read: true, readAt: new Date() },
        ),
    );
    return { success: true };
  }

  async markAllAsRead(userId: string, companyId: string) {
    await this.tenantService.run(
      { companyId, isSuperAdmin: false, userId, siteScope: 'all' },
      () =>
        this.repo.update(
          { userId, company_id: companyId, read: false },
          { read: true, readAt: new Date() },
        ),
    );
    return { success: true };
  }

  async getUnreadCount(userId: string, companyId: string): Promise<number> {
    return this.tenantService.run(
      { companyId, isSuperAdmin: false, userId, siteScope: 'all' },
      () =>
        this.repo.count({
          where: { userId, company_id: companyId, read: false },
        }),
    );
  }

  async findAll(userId: string, companyId: string, page = 1, limit = 20) {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const [items, total] = await this.tenantService.run(
      { companyId, isSuperAdmin: false, userId, siteScope: 'all' },
      () =>
        this.repo.findAndCount({
          where: { userId, company_id: companyId },
          order: { createdAt: 'DESC' },
          skip: (page - 1) * safeLimit,
          take: safeLimit,
        }),
    );

    return {
      items,
      total,
      page,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }
}
