import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import {
  CreateContentPlanDto,
  CreateCmsDraftDto,
  InternalLinkCandidatesQueryDto,
  ListContentPlansQueryDto,
  RejectContentDto,
  UpdateContentPlanDto,
} from '../dto/content-plan.dto';
import { CONTENT_AUTOMATION_PERMISSION } from '../entities/content-automation.constants';
import {
  CONTENT_AI_PROMPT_KEY_ANALYZE,
  CONTENT_AI_PROMPT_KEY_OUTLINE,
  CONTENT_AI_PROMPT_KEY_WRITE,
} from '../entities/content-ai.constants';
import { ContentAiConfigService } from '../config/content-ai-config.service';
import { ContentAutomationEnabledGuard } from '../guards/content-automation-enabled.guard';
import { AiPromptRepository } from '../repositories/ai-prompt.repository';
import { ContentAutomationConfigService } from '../services/content-automation-config.service';
import { ContentPlanService } from '../services/content-plan.service';
import { InternalLinkCandidateService } from '../services/internal-link-candidate.service';

@Controller('admin/content-automation')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions(CONTENT_AUTOMATION_PERMISSION)
export class ContentAutomationAdminController {
  constructor(
    private readonly config: ContentAutomationConfigService,
    private readonly aiConfig: ContentAiConfigService,
    private readonly promptRepository: AiPromptRepository,
    private readonly planService: ContentPlanService,
    private readonly linkCandidates: InternalLinkCandidateService,
  ) {}

  /** Always available so admin UI can show enabled/disabled banner. */
  @Get('status')
  async getStatus() {
    const [aiConfigured, prompts] = await Promise.all([
      this.aiConfig.isConfigured(),
      this.promptRepository.listActive(),
    ]);
    const keys = new Set(prompts.map((p) => p.key));
    const promptsReady =
      keys.has(CONTENT_AI_PROMPT_KEY_ANALYZE) &&
      keys.has(CONTENT_AI_PROMPT_KEY_OUTLINE) &&
      keys.has(CONTENT_AI_PROMPT_KEY_WRITE);

    return {
      enabled: this.config.isEnabled(),
      queue: this.config.getQueueName(),
      version: '1.0-m4-ops3',
      aiConfigured,
      promptsReady,
      heuristicFallbackAllowed: this.config.isHeuristicFallbackAllowed(),
    };
  }

  /** Plan CRUD available when flag OFF — only AI enqueue / CMS publish path stays gated. */
  @Post('plans')
  createPlan(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateContentPlanDto,
  ) {
    return this.planService.create(user.id, dto);
  }

  /** Read-only — available when flag OFF so ops can inspect plans/history. */
  @Get('plans')
  listPlans(@Query() query: ListContentPlansQueryDto) {
    return this.planService.list(query);
  }

  @Get('plans/:id')
  getPlan(@Param('id', ParseUUIDPipe) id: string) {
    return this.planService.getById(id);
  }

  @Get('plans/:id/context')
  getPlanContext(@Param('id', ParseUUIDPipe) id: string) {
    return this.planService.getContext(id);
  }

  @Get('plans/:id/preview')
  getPreview(@Param('id', ParseUUIDPipe) id: string) {
    return this.planService.getPreview(id);
  }

  @Get('plans/:id/ai-runs')
  listAiRuns(@Param('id', ParseUUIDPipe) id: string) {
    return this.planService.listAiRuns(id);
  }

  @Get('ai-runs/:id')
  getAiRun(@Param('id', ParseUUIDPipe) id: string) {
    return this.planService.getAiRun(id);
  }

  @Patch('plans/:id')
  updatePlan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContentPlanDto,
  ) {
    return this.planService.update(id, dto);
  }

  @Post('plans/:id/archive')
  archivePlan(@Param('id', ParseUUIDPipe) id: string) {
    return this.planService.archive(id);
  }

  @Post('plans/:id/restore')
  restorePlan(@Param('id', ParseUUIDPipe) id: string) {
    return this.planService.restore(id);
  }

  @Post('plans/:id/analyze')
  @UseGuards(ContentAutomationEnabledGuard)
  async analyzePlan(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.planService.requestAnalyze(id);
    res.status(result.reused ? HttpStatus.OK : HttpStatus.ACCEPTED);
    return result;
  }

  @Post('plans/:id/generate-outline')
  @UseGuards(ContentAutomationEnabledGuard)
  async generateOutline(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.planService.requestGenerateOutline(id);
    res.status(result.reused ? HttpStatus.OK : HttpStatus.ACCEPTED);
    return result;
  }

  @Post('plans/:id/approve-outline')
  approveOutline(@Param('id', ParseUUIDPipe) id: string) {
    return this.planService.approveOutline(id);
  }

  @Post('plans/:id/reject-outline')
  rejectOutline(@Param('id', ParseUUIDPipe) id: string) {
    return this.planService.rejectOutline(id);
  }

  @Post('plans/:id/generate-article')
  @UseGuards(ContentAutomationEnabledGuard)
  async generateArticle(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.planService.requestGenerateArticle(id);
    res.status(result.reused ? HttpStatus.OK : HttpStatus.ACCEPTED);
    return result;
  }

  @Post('plans/:id/run-quality-gate')
  @HttpCode(HttpStatus.OK)
  runQualityGate(@Param('id', ParseUUIDPipe) id: string) {
    return this.planService.runQualityGate(id);
  }

  @Post('plans/:id/approve-content')
  approveContent(@Param('id', ParseUUIDPipe) id: string) {
    return this.planService.approveContent(id);
  }

  @Post('plans/:id/reject-content')
  rejectContent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectContentDto,
  ) {
    return this.planService.rejectContent(id, dto.mode ?? 're-write');
  }

  @Post('plans/:id/create-cms-draft')
  createCmsDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCmsDraftDto,
  ) {
    return this.planService.createCmsDraft(user.id, id, dto.force ?? false);
  }

  @Get('internal-link-candidates')
  listInternalLinkCandidates(@Query() query: InternalLinkCandidatesQueryDto) {
    return this.linkCandidates.listCandidates(query);
  }
}
