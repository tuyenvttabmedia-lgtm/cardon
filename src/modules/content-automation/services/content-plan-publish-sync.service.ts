import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { CmsPageStatus, ContentPlanStatus } from '@prisma/client';
import { shouldRegisterWorkers } from '../../../config/process-role';
import { CmsService } from '../../cms/services/cms.service';
import { ContentPlanRepository } from '../repositories/content-plan.repository';
import { ContentAutomationConfigService } from './content-automation-config.service';
import { ContentAutomationAuditService } from './content-automation-audit.service';

const SYNC_INTERVAL_MS = 60 * 1000;
const SYNC_PAGE_SIZE = 100;

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
    // Run only on worker (or all) — avoid duplicate timers on API + worker.
    if (!shouldRegisterWorkers()) {
      this.logger.log('Content plan publish sync skipped (API-only process)');
      return;
    }
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
      let skip = 0;
      for (;;) {
        const items = await this.planRepository.listApprovedWithCmsPage({
          skip,
          take: SYNC_PAGE_SIZE,
        });
        if (items.length === 0) break;

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
          } catch (err) {
            if (err instanceof NotFoundException) {
              this.logger.warn(`Publish sync — CMS page missing for plan ${plan.id}, clearing link`);
              await this.planRepository.update(plan.id, { cmsPageId: null });
              this.audit.log('plan.cms_link.cleared', {
                planId: plan.id,
                reason: 'CMS_NOT_FOUND',
              });
            } else {
              this.logger.warn(
                `Publish sync transient error plan=${plan.id}: ${
                  err instanceof Error ? err.message : 'unknown'
                }`,
              );
            }
          }
        }

        if (items.length < SYNC_PAGE_SIZE) break;
        skip += items.length;
      }
    } finally {
      this.running = false;
    }
  }
}
