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
  UseGuards,
} from '@nestjs/common';
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
@UseGuards(JwtAuthGuard, PermissionsGuard, ContentAutomationEnabledGuard)
@Permissions(CONTENT_AUTOMATION_PERMISSION)
export class ContentAutomationAdminController {
  constructor(
    private readonly config: ContentAutomationConfigService,
    private readonly planService: ContentPlanService,
    private readonly linkCandidates: InternalLinkCandidateService,
  ) {}

  @Get('status')
  getStatus() {
    return {
      enabled: this.config.isEnabled(),
      queue: this.config.getQueueName(),
      version: '1.0-m4',
    };
  }

  @Post('plans')
  createPlan(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateContentPlanDto,
  ) {
    return this.planService.create(user.id, dto);
  }

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

  @Post('plans/:id/analyze')
  @HttpCode(HttpStatus.ACCEPTED)
  analyzePlan(@Param('id', ParseUUIDPipe) id: string) {
    return this.planService.requestAnalyze(id);
  }

  @Post('plans/:id/generate-outline')
  @HttpCode(HttpStatus.ACCEPTED)
  generateOutline(@Param('id', ParseUUIDPipe) id: string) {
    return this.planService.requestGenerateOutline(id);
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
  @HttpCode(HttpStatus.ACCEPTED)
  generateArticle(@Param('id', ParseUUIDPipe) id: string) {
    return this.planService.requestGenerateArticle(id);
  }

  @Post('plans/:id/run-quality-gate')
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
