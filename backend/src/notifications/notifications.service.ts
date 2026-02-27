import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationsGateway } from './notifications.gateway';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private repo: Repository<Notification>,
    private gateway: NotificationsGateway,
  ) {}

  async create(data: {
    userId: string;
    type: string;
    title: string;
    message: string;
    data?: any;
  }) {
    const notification = await this.repo.save(data);

    // Enviar em tempo real
    this.gateway.sendToUser(data.userId, 'notification', notification);

    return notification;
  }

  async markAsRead(id: string, userId: string) {
    await this.repo.update({ id, userId }, { read: true, readAt: new Date() });
    return { success: true };
  }

  async markAllAsRead(userId: string) {
    await this.repo.update(
      { userId, read: false },
      { read: true, readAt: new Date() },
    );
    return { success: true };
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.repo.count({
      where: { userId, read: false },
    });
  }

  async findAll(userId: string, page = 1, limit = 20) {
    const [items, total] = await this.repo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
