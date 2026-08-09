import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { CmsService } from './cms.service';

const SWEEP_INTERVAL_MS = 60 * 1000;
const FIRST_RUN_DELAY_MS = 20 * 1000;

@Injectable()
export class CmsScheduledPublishCronService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CmsScheduledPublishCronService.name);
  private timer?: ReturnType<typeof setInterval>;
  private firstRunTimer?: ReturnType<typeof setTimeout>;
  private running = false;

  constructor(private readonly cmsService: CmsService) {}

  onModuleInit(): void {
    this.firstRunTimer = setTimeout(() => void this.sweep(), FIRST_RUN_DELAY_MS);
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    this.logger.log(
      `CMS scheduled-publish sweep started (every ${SWEEP_INTERVAL_MS / 1000}s)`,
    );
  }

  onModuleDestroy(): void {
    if (this.firstRunTimer) clearTimeout(this.firstRunTimer);
    if (this.timer) clearInterval(this.timer);
  }

  async sweep(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const count = await this.cmsService.publishDueScheduledPages();
      if (count > 0) {
        this.logger.log(`Published ${count} scheduled CMS page(s)`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`CMS scheduled-publish sweep failed: ${message}`);
    } finally {
      this.running = false;
    }
  }
}
