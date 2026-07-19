import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  ActivityEventPayload,
  ActivityEventSubscriber,
} from '../../activity-event/interfaces/activity-event.interface';
import { ActivityEventDispatcher } from '../../activity-event/activity-event-dispatcher.service';
import { NotificationDispatcher } from '../services/notification-dispatcher.service';
import { SystemNotificationService } from '../services/system-notification.service';

@Injectable()
export class NotificationActivitySubscriber implements ActivityEventSubscriber, OnModuleInit {
  constructor(
    private readonly activityDispatcher: ActivityEventDispatcher,
    private readonly notificationDispatcher: NotificationDispatcher,
    private readonly systemNotificationService: SystemNotificationService,
  ) {}

  onModuleInit(): void {
    this.activityDispatcher.register(this);
  }

  handle(event: ActivityEventPayload): void {
    const payload = this.systemNotificationService.fromActivityEvent(event);
    if (!payload) {
      return;
    }
    this.notificationDispatcher.dispatch(payload);
  }
}
