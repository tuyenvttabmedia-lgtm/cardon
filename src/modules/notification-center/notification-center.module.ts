import { Module } from '@nestjs/common';
import { ActivityEventModule } from '../activity-event/activity-event.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationModule } from '../notification/notification.module';
import { RbacModule } from '../rbac/rbac.module';
import { SettingsModule } from '../settings/settings.module';
import { SystemNotificationController } from './controllers/system-notification.controller';
import { SystemNotificationRepository } from './repositories/system-notification.repository';
import { NotificationDispatcher } from './services/notification-dispatcher.service';
import { SystemNotificationService } from './services/system-notification.service';
import { NotificationActivitySubscriber } from './subscribers/notification-activity.subscriber';

@Module({
  imports: [ActivityEventModule, AuthModule, RbacModule, NotificationModule, SettingsModule],
  controllers: [SystemNotificationController],
  providers: [
    SystemNotificationRepository,
    SystemNotificationService,
    NotificationDispatcher,
    NotificationActivitySubscriber,
  ],
  exports: [SystemNotificationService, NotificationDispatcher],
})
export class NotificationCenterModule {}
