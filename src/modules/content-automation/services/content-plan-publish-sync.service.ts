import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { CmsPageStatus, ContentPlanStatus } from '@prisma/client';
import { CmsService } from '../../cms/services/cms.service';
import { ContentPlanRepository } from '../repositories/content-plan.repository';
import { ContentAutomationConfigService } from './content-automation-config.service';
import { ContentAutomationAuditService } from './content-automation-audit.service';

const SYNC_INTERVAL_MS = 60 * 1000;

@Injectable()
export class ContentPlanPublishSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ContentPlanPublishSyncService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    private readonly config: ContentAutomationConfigService,
    private readonly planRepository: ContentPlanRepository,
    private readonly cmsService: CmsService,
    private readonly audit: ContentAutomationAuditService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.syncPublishedPlans(), SYNC_INTERVAL_MS);
    this.logger.log('Content plan publish sync started (every 60s)');
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async syncPublishedPlans(): Promise<void> {
    if (!this.config.isEnabled() || this.running) return;
    this.running = true;

    try {
      const { items } = await this.planRepository.list({
        status: ContentPlanStatus.APPROVED,
        skip: 0,
        take: 100,
      });

      for (const plan of items) {
        if (!plan.cmsPageId) continue;

        try {
          const page = await this.cmsService.getPage(plan.cmsPageId);
          if (page.status !== CmsPageStatus.PUBLISHED) continue;

          await this.planRepository.update(plan.id, {
            status: ContentPlanStatus.PUBLISHED,
            publishedAt: page.publishedAt ?? new Date(),
          });

          this.audit.log('plan.published.synced', {
            planId: plan.id,
            cmsPageId: plan.cmsPageId,
          });
        } catch {
          this.logger.warn(`Publish sync — CMS page missing for plan ${plan.id}`);
          await this.planRepository.update(plan.id, { cmsPageId: null });
        }
      }
    } finally {
      this.running = false;
    }
  }
}
