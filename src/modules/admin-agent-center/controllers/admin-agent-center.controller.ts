import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { existsSync, createReadStream } from 'fs';
import { basename } from 'path';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import {
  AdminAgentCenterListQueryDto,
  AdminAgentCenterMetaDto,
  AdminAgentCenterOnboardingQueryDto,
  AdminAgentCenterSearchQueryDto,
  AdminAgentCenterStatementQueryDto,
  AdminAgentCenterTabQueryDto,
} from '../dto/admin-agent-center.dto';
import { UpdateAgentMarginConfigDto } from '../dto/admin-agent-margin.dto';
import { AdminAgentCenterService } from '../services/admin-agent-center.service';
import { AgentKycDocumentService } from '../../agent/services/agent-kyc-document.service';

@Controller('admin/agent-center')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdminAgentCenterController {
  constructor(
    private readonly service: AdminAgentCenterService,
    private readonly kycDocumentService: AgentKycDocumentService,
  ) {}

  @Get('dashboard')
  @Permissions('users.read')
  dashboard() {
    return this.service.getDashboard();
  }

  @Get('agents')
  @Permissions('users.read')
  listAgents(@Query() query: AdminAgentCenterListQueryDto) {
    return this.service.listAgents(query);
  }

  @Get('agents/search')
  @Permissions('users.read')
  searchAgents(@Query() query: AdminAgentCenterSearchQueryDto) {
    return this.service.searchAgents(query);
  }

  @Get('kyc-queue')
  @Permissions('users.read', 'agents.kyc.review')
  kycQueue(@Query() query: AdminAgentCenterTabQueryDto) {
    return this.service.getKycQueue(query);
  }

  @Get('onboarding-queue')
  @Permissions('users.read', 'agents.kyc.review')
  onboardingQueue(@Query() query: AdminAgentCenterOnboardingQueryDto) {
    return this.service.getOnboardingQueue(query);
  }

  @Get('agents/:agentId/onboarding')
  @Permissions('users.read', 'agents.kyc.review')
  agentOnboarding(@Param('agentId', ParseUUIDPipe) agentId: string) {
    return this.service.getAgentOnboarding(agentId);
  }

  @Get('agents/:agentId/onboarding/kyc-document')
  @Permissions('users.read', 'agents.kyc.review')
  async kycDocument(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Query('key') storageKey: string,
    @Res() res: Response,
  ) {
    if (!storageKey?.trim()) {
      res.status(400).json({ success: false, error: { message: 'key is required' } });
      return;
    }
    const filePath = this.kycDocumentService.resolveFilePath(agentId, storageKey.trim());
    if (!existsSync(filePath)) {
      throw new NotFoundException('Document not found');
    }
    const filename = basename(filePath);
    const ext = filename.split('.').pop()?.toLowerCase();
    const mimeType =
      ext === 'png'
        ? 'image/png'
        : ext === 'webp'
          ? 'image/webp'
          : ext === 'svg'
            ? 'image/svg+xml'
            : 'image/jpeg';
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    createReadStream(filePath).pipe(res);
  }

  @Get('tags')
  @Permissions('users.read')
  allowedTags() {
    return this.service.allowedTags();
  }

  @Get('roles/matrix')
  @Permissions('users.read')
  rolesMatrix() {
    return this.service.getRoles();
  }

  @Get('agents/:agentId/overview')
  @Permissions('users.read')
  overview(@Param('agentId', ParseUUIDPipe) agentId: string) {
    return this.service.getOverview(agentId);
  }

  @Get('agents/:agentId/information')
  @Permissions('users.read')
  information(@Param('agentId', ParseUUIDPipe) agentId: string) {
    return this.service.getInformation(agentId);
  }

  @Get('agents/:agentId/wallet')
  @Permissions('users.read', 'ledger.view')
  wallet(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Query() query: AdminAgentCenterTabQueryDto,
  ) {
    return this.service.getWallet(agentId, query);
  }

  @Get('agents/:agentId/api')
  @Permissions('users.read')
  api(@Param('agentId', ParseUUIDPipe) agentId: string) {
    return this.service.getApi(agentId);
  }

  @Post('agents/:agentId/ip-whitelist/:entryId/approve')
  @Permissions('agents.manage')
  approveIpWhitelist(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
  ) {
    return this.service.approveIpWhitelistEntry(agentId, entryId, admin.id, admin.email);
  }

  @Post('agents/:agentId/ip-whitelist/:entryId/reject')
  @Permissions('agents.manage')
  rejectIpWhitelist(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
  ) {
    return this.service.rejectIpWhitelistEntry(agentId, entryId, admin.id, admin.email);
  }

  @Get('agents/:agentId/webhooks')
  @Permissions('users.read')
  webhooks(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Query() query: AdminAgentCenterTabQueryDto,
  ) {
    return this.service.getWebhooks(agentId, query);
  }

  @Get('agents/:agentId/members')
  @Permissions('users.read')
  members(@Param('agentId', ParseUUIDPipe) agentId: string) {
    return this.service.getMembers(agentId);
  }

  @Get('agents/:agentId/orders')
  @Permissions('users.read', 'orders.read')
  orders(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Query() query: AdminAgentCenterTabQueryDto,
  ) {
    return this.service.getOrders(agentId, query);
  }

  @Get('agents/:agentId/activity')
  @Permissions('users.read', 'activity.read')
  activity(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Query() query: AdminAgentCenterTabQueryDto,
  ) {
    return this.service.getActivity(agentId, query);
  }

  @Get('agents/:agentId/login-history')
  @Permissions('users.read')
  loginHistory(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Query() query: AdminAgentCenterTabQueryDto,
  ) {
    return this.service.getLoginHistory(agentId, query);
  }

  @Get('margin-config')
  @Permissions('pricing.manage')
  marginConfig() {
    return this.service.getMarginConfig();
  }

  @Patch('margin-config')
  @Permissions('pricing.manage')
  updateMarginConfig(
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: UpdateAgentMarginConfigDto,
  ) {
    return this.service.updateMarginConfig(dto, admin.id, admin.email, admin.role);
  }

  @Get('agents/:agentId/pricing')
  @Permissions('users.read', 'pricing.manage')
  pricing(@Param('agentId', ParseUUIDPipe) agentId: string) {
    return this.service.getPricing(agentId);
  }

  @Patch('agents/:agentId/meta')
  @Permissions('agents.manage')
  updateMeta(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Body() dto: AdminAgentCenterMetaDto,
  ) {
    return this.service.updateMeta(agentId, admin.id, admin.email, dto);
  }
}
