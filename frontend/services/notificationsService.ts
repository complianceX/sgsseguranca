import api from '@/lib/api';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  read: boolean;
  createdAt: string;
  readAt?: string | null;
}

interface FindAllResponse {
  items: AppNotification[];
  total: number;
  page: number;
  limit: number;
}

export const notificationsService = {
  async findAll(page = 1, limit = 20): Promise<FindAllResponse> {
    const res = await api.get<FindAllResponse>('/notifications', {
      params: { page, limit },
    });
    return res.data;
  },

  async getUnreadCount(): Promise<{ count: number }> {
    const res = await api.get<{ count: number }>('/notifications/unread-count');
    return res.data;
  },

  async markAsRead(id: string): Promise<void> {
    await api.patch(`/notifications/${id}/read`);
  },

  async markAllAsRead(): Promise<void> {
    await api.post('/notifications/read-all');
  },
};
