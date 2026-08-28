import { Injectable } from '@nestjs/common';

@Injectable()
export class ContentAutomationConfigService {
  isEnabled(): boolean {
    return process.env.CONTENT_AUTOMATION_ENABLED === 'true';
  }

  /**
   * When false (default), missing AI config / prompt templates fail the run
   * instead of silently succeeding via heuristic skeleton output.
   * Set CONTENT_AUTOMATION_ALLOW_HEURISTIC_FALLBACK=true only for local/dev.
   */
  isHeuristicFallbackAllowed(): boolean {
    return process.env.CONTENT_AUTOMATION_ALLOW_HEURISTIC_FALLBACK === 'true';
  }

  getQueueName(): string {
    return 'content_automation_queue';
  }
}
