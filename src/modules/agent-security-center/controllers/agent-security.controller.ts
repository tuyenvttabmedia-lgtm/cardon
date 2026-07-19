import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AgentPlatformService } from '../../agent-platform/services/agent-platform.service';
import { AgentPlatformRole } from '../../agent-platform/entities/agent-platform.constants';
import { AgentSecurityService } from '../services/agent-security.service';

@Controller('agents/me/security')
@UseGuards(JwtAuthGuard)
export class AgentSecurityController {
  constructor(
    private readonly securityService: AgentSecurityService,
    private readonly platformService: AgentPlatformService,
  ) {}

  private async role(user: AuthenticatedUser): Promise<AgentPlatformRole> {
    const session = await this.platformService.getSession(user.id, user);
    return session.platformRole;
  }

  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.securityService.getDashboard(user.id);
  }

  @Get('api-keys')
  apiKeys(@CurrentUser() user: AuthenticatedUser) {
    return this.securityService.getApiKeys(user.id);
  }

  @Post('api-keys/rotate')
  async rotateKey(@CurrentUser() user: AuthenticatedUser) {
    return this.securityService.rotateApiKey(user.id, await this.role(user));
  }

  @Post('api-keys/disable')
  async disableKey(@CurrentUser() user: AuthenticatedUser) {
    return this.securityService.disableApiKey(user.id, await this.role(user));
  }

  @Post('api-keys/enable')
  async enableKey(@CurrentUser() user: AuthenticatedUser) {
    return this.securityService.enableApiKey(user.id, await this.role(user));
  }

  @Patch('api-keys/rename')
  async renameKey(@CurrentUser() user: AuthenticatedUser, @Body() body: { label: string }) {
    return this.securityService.renameApiKey(user.id, await this.role(user), body.label);
  }

  @Patch('api-keys')
  async updateKeyMeta(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { environment?: string; expiresAt?: string | null },
  ) {
    return this.securityService.updateApiKeyMeta(user.id, await this.role(user), body);
  }

  @Get('ip-whitelist')
  ipWhitelist(@CurrentUser() user: AuthenticatedUser, @Query('search') search?: string) {
    return this.securityService.listIpWhitelist(user.id, search);
  }

  @Post('ip-whitelist')
  async createIp(@CurrentUser() user: AuthenticatedUser, @Body() body: { cidr: string; description?: string }) {
    return this.securityService.createIpWhitelist(user.id, await this.role(user), body);
  }

  @Patch('ip-whitelist/:id')
  async updateIp(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { cidr?: string; description?: string; enabled?: boolean },
  ) {
    return this.securityService.updateIpWhitelist(user.id, await this.role(user), id, body);
  }

  @Delete('ip-whitelist/:id')
  async deleteIp(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.securityService.deleteIpWhitelist(user.id, await this.role(user), id);
  }

  @Get('webhook')
  webhook(@CurrentUser() user: AuthenticatedUser) {
    return this.securityService.getWebhookSecurity(user.id);
  }

  @Put('webhook')
  async updateWebhook(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { callbackUrl?: string; enabled?: boolean; events?: unknown[] },
  ) {
    return this.securityService.updateWebhookSecurity(user.id, await this.role(user), body);
  }

  @Post('webhook/rotate-secret')
  async rotateWebhookSecret(@CurrentUser() user: AuthenticatedUser) {
    return this.securityService.rotateWebhookSecret(user.id, await this.role(user));
  }

  @Get('rate-limit')
  rateLimit(@CurrentUser() user: AuthenticatedUser) {
    return this.securityService.getRateLimit(user.id);
  }

  @Get('logs')
  logs(
    @CurrentUser() user: AuthenticatedUser,
    @Query('type') type?: string,
    @Query('search') search?: string,
    @Query('take') take?: string,
  ) {
    return this.securityService.listApiLogs(user.id, type, search, take ? Number(take) : 50);
  }

  @Get('events')
  events(@CurrentUser() user: AuthenticatedUser, @Query('take') take?: string) {
    return this.securityService.listSecurityEventsForUser(user.id, take ? Number(take) : 50);
  }
}
