import { Injectable } from '@nestjs/common';
import { AppLoggerService } from '../../logger/app-logger.service';
import {
  ActivityEventPayload,
  ActivityEventSubscriber,
} from './interfaces/activity-event.interface';

@Injectable()
export class ActivityEventDispatcher {
  private readonly subscribers = new Set<ActivityEventSubscriber>();

  constructor(private readonly logger: AppLoggerService) {}

  register(subscriber: ActivityEventSubscriber): void {
    this.subscribers.add(subscriber);
  }

  unregister(subscriber: ActivityEventSubscriber): void {
    this.subscribers.delete(subscriber);
  }

  dispatch(event: ActivityEventPayload): void {
    for (const subscriber of this.subscribers) {
      void Promise.resolve(subscriber.handle(event)).catch((err: unknown) => {
        this.logger.error(
          `Activity subscriber failed: ${err instanceof Error ? err.message : String(err)}`,
          err instanceof Error ? err.stack : undefined,
          ActivityEventDispatcher.name,
        );
      });
    }
  }
}
