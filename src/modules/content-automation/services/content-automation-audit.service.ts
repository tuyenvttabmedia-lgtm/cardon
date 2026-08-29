import { Injectable, Logger } from '@nestjs/common';

export type ContentAutomationAuditEvent =
  | 'plan.created'
  | 'plan.updated'
  | 'plan.archived'
  | 'plan.restored'
  | 'plan.deleted'
  | 'plan.analyze.requested'
  | 'plan.analyze.completed'
  | 'plan.analyze.failed'
  | 'plan.outline.requested'
  | 'plan.outline.completed'
  | 'plan.outline.approved'
  | 'plan.outline.rejected'
  | 'plan.write.requested'
  | 'plan.write.completed'
  | 'plan.quality.checked'
  | 'plan.content.approved'
  | 'plan.content.rejected.re-write'
  | 'plan.content.rejected.re-outline'
  | 'plan.cms_draft.created'
  | 'plan.cms_link.cleared'
  | 'plan.published.synced'
  | 'plan.ai.failed';

@Injectable()
export class ContentAutomationAuditService {
  private readonly logger = new Logger('ContentAutomationAudit');

  log(
    event: ContentAutomationAuditEvent,
    payload: Record<string, unknown>,
  ): void {
    this.logger.log(
      JSON.stringify({
        event,
        module: 'content-automation',
        at: new Date().toISOString(),
        ...payload,
      }),
    );
  }
}
