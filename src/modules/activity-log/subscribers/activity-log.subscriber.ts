import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  ActivityEventPayload,
  ActivityEventSubscriber,
} from '../../activity-event/interfaces/activity-event.interface';
import { ActivityEventDispatcher } from '../../activity-event/activity-event-dispatcher.service';
import { ActivityLogService } from '../services/activity-log.service';

@Injectable()
export class ActivityLogSubscriber implements ActivityEventSubscriber, OnModuleInit {
  constructor(
    private readonly dispatcher: ActivityEventDispatcher,
    private readonly activityLogService: ActivityLogService,
  ) {}

  onModuleInit(): void {
    this.dispatcher.register(this);
  }

  handle(event: ActivityEventPayload): void {
    this.activityLogService.create(event);
  }
}
