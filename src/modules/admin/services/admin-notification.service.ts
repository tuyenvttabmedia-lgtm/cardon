import { Injectable } from '@nestjs/common';
import { NotificationRecipientRole, NotificationRecipientType } from '@prisma/client';
import { NotificationRepository } from '../../notification/repositories/notification.repository';

@Injectable()
export class AdminNotificationService {
  constructor(private readonly repository: NotificationRepository) {}

  listForAdmin(take = 50) {
    return this.repository.listForAdminRole(take);
  }

  countUnreadForAdmin() {
    return this.repository.countUnreadForAdminRole().then((count) => ({ count }));
  }

  markRead(notificationId: string) {
    return this.repository.markReadForAdminRole(notificationId).then((result) => ({
      count: result.count,
    }));
  }
}
