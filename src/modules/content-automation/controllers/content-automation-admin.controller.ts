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
import { ContentAutomationEnabledGuard } from '../guards/content-automation-enabled.guard';
import { ContentAutomationConfigService } from '../services/content-automation-config.service';
import { ContentPlanService } from '../services/content-plan.service';
import { InternalLinkCandidateService } from '../services/internal-link-candidate.service';

@Controller('admin/content-automation')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions(CONTENT_AUTOMATION_PERMISSION)
export class ContentAutomationAdminController {
  constructor(
    private readonly config: ContentAutomationConfigService,
    private readonly planService: ContentPlanService,
    private readonly linkCandidates: InternalLinkCandidateService,
  ) {}

  /** Always available so admin UI can show enabled/disabled banner. */
  @Get('status')
  getStatus() {
    return {
      enabled: this.config.isEnabled(),
      queue: this.config.getQueueName(),
      version: '1.0-m4-ops',
    };
  }

  @Post('plans')
  @UseGuards(ContentAutomationEnabledGuard)
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
  @UseGuards(ContentAutomationEnabledGuard)
  updatePlan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContentPlanDto,
  ) {
    return this.planService.update(id, dto);
  }

  @Post('plans/:id/archive')
  @UseGuards(ContentAutomationEnabledGuard)
  archivePlan(@Param('id', ParseUUIDPipe) id: string) {
    return this.planService.archive(id);
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
  @UseGuards(ContentAutomationEnabledGuard)
  approveOutline(@Param('id', ParseUUIDPipe) id: string) {
    return this.planService.approveOutline(id);
  }

  @Post('plans/:id/reject-outline')
  @UseGuards(ContentAutomationEnabledGuard)
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
  @UseGuards(ContentAutomationEnabledGuard)
  @HttpCode(HttpStatus.OK)
  runQualityGate(@Param('id', ParseUUIDPipe) id: string) {
    return this.planService.runQualityGate(id);
  }

  @Post('plans/:id/approve-content')
  @UseGuards(ContentAutomationEnabledGuard)
  approveContent(@Param('id', ParseUUIDPipe) id: string) {
    return this.planService.approveContent(id);
  }

  @Post('plans/:id/reject-content')
  @UseGuards(ContentAutomationEnabledGuard)
  rejectContent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectContentDto,
  ) {
    return this.planService.rejectContent(id, dto.mode ?? 're-write');
  }

  @Post('plans/:id/create-cms-draft')
  @UseGuards(ContentAutomationEnabledGuard)
  createCmsDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCmsDraftDto,
  ) {
    return this.planService.createCmsDraft(user.id, id, dto.force ?? false);
  }

  @Get('internal-link-candidates')
  @UseGuards(ContentAutomationEnabledGuard)
  listInternalLinkCandidates(@Query() query: InternalLinkCandidatesQueryDto) {
    return this.linkCandidates.listCandidates(query);
  }
}
