import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { CmsModule } from '../cms/cms.module';

import { ProductModule } from '../product/product.module';

import { SettingsModule } from '../settings/settings.module';

import { ContentAiConfigService } from './config/content-ai-config.service';

import { ContentAutomationAdminController } from './controllers/content-automation-admin.controller';

import { AiWorkerGuardService } from './guards/ai-worker-guard.service';

import { ContentAutomationEnabledGuard } from './guards/content-automation-enabled.guard';

import { AiOrchestratorService } from './orchestrators/ai-orchestrator.service';

import { PromptComposerService } from './prompts/prompt-composer.service';

import { OpenAiCompatibleProvider } from './providers/openai-compatible.provider';

import { ContentAutomationQueueProducer } from './producers/content-automation-queue.producer';

import { AiPromptRepository } from './repositories/ai-prompt.repository';

import { AiRunRepository } from './repositories/ai-run.repository';

import { ContentPlanRepository } from './repositories/content-plan.repository';

import { BrandContextService } from './services/brand-context.service';

import { ContentAutomationAuditService } from './services/content-automation-audit.service';

import { ContentAutomationCmsAdapter } from './services/content-automation-cms.adapter';

import { ContentAutomationConfigService } from './services/content-automation-config.service';

import { ContentIntelligenceService } from './services/content-intelligence.service';

import { ContentPlanPublishSyncService } from './services/content-plan-publish-sync.service';

import { ContentPlanService } from './services/content-plan.service';

import { ContextBuilderService } from './services/context-builder.service';

import { ExistingContentContextService } from './services/existing-content-context.service';

import { FactContextService } from './services/fact-context.service';

import { InternalLinkCandidateService } from './services/internal-link-candidate.service';

import { QualityGateService } from './services/quality-gate.service';

import { HeuristicAnalyzeStrategy } from './strategies/heuristic-analyze.strategy';

import { HeuristicOutlineStrategy } from './strategies/heuristic-outline.strategy';

import { HeuristicWriteStrategy } from './strategies/heuristic-write.strategy';

import { contentAutomationWorkerProviders } from './workers/content-automation.worker';

@Module({
  imports: [AuthModule, CmsModule, ProductModule, SettingsModule],
  controllers: [ContentAutomationAdminController],
  providers: [
    ContentAutomationConfigService,
    ContentAiConfigService,
    ContentPlanRepository,
    AiRunRepository,
    AiPromptRepository,
    ContentAutomationQueueProducer,
    ContentAutomationEnabledGuard,
    ContentAutomationAuditService,
    BrandContextService,
    FactContextService,
    ExistingContentContextService,
    InternalLinkCandidateService,
    ContextBuilderService,
    HeuristicAnalyzeStrategy,
    HeuristicOutlineStrategy,
    HeuristicWriteStrategy,
    ContentIntelligenceService,
    QualityGateService,
    ContentAutomationCmsAdapter,
    ContentPlanPublishSyncService,
    ContentPlanService,
    AiWorkerGuardService,
    PromptComposerService,
    OpenAiCompatibleProvider,
    AiOrchestratorService,
    ...contentAutomationWorkerProviders,
  ],
  exports: [
    ContentAutomationConfigService,
    ContentAiConfigService,
    ContentPlanRepository,
    AiRunRepository,
    AiPromptRepository,
    ContentAutomationQueueProducer,
  ],
})
export class ContentAutomationModule {}
