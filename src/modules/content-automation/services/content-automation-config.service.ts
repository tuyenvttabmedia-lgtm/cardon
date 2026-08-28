import { Injectable } from '@nestjs/common';

@Injectable()
export class ContentAutomationConfigService {
  isEnabled(): boolean {
    return process.env.CONTENT_AUTOMATION_ENABLED === 'true';
  }

  getQueueName(): string {
    return 'content_automation_queue';
  }
}
