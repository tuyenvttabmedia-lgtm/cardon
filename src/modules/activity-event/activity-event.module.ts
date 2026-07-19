import { Global, Module } from '@nestjs/common';
import { ActivityEventDispatcher } from './activity-event-dispatcher.service';

@Global()
@Module({
  providers: [ActivityEventDispatcher],
  exports: [ActivityEventDispatcher],
})
export class ActivityEventModule {}
