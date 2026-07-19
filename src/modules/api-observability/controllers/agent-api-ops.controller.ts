import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AgentRepository } from '../../agent/repositories/agent.repository';
import { AgentPlatformRole } from '../../agent-platform/entities/agent-platform.constants';
import { AgentPlatformService } from '../../agent-platform/services/agent-platform.service';
import { API_ERROR_CODES } from '../entities/api-observability.constants';
import { AgentApiExportService } from '../services/agent-api-export.service';
import { AgentApiRequestLogService } from '../services/agent-api-request-log.service';
import { AgentApiTestService } from '../services/agent-api-test.service';
import { AgentApiUsageService } from '../services/agent-api-usage.service';

@Controller('agents/me/api-ops')
@UseGuards(JwtAuthGuard)
export class AgentApiOpsController {
  constructor(
    private readonly logService: AgentApiRequestLogService,
    private readonly usageService: AgentApiUsageService,
    private readonly exportService: AgentApiExportService,
    private readonly testService: AgentApiTestService,
    private readonly platformService: AgentPlatformService,
    private readonly agentRepository: AgentRepository,
  ) {}

  private async role(user: AuthenticatedUser): Promise<AgentPlatformRole> {
    const session = await this.platformService.getSession(user.id, user);
    return session.platformRole;
  }

  private async agentId(userId: string) {
    const agent = await this.agentRepository.findByUserId(userId);
    if (!agent) throw new ForbiddenException('Agent not found');
    return agent.id;
  }

  @Get('logs')
  async listLogs(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
    @Query('search') search?: string,
    @Query('httpStatus') httpStatus?: string,
    @Query('endpoint') endpoint?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.logService.listForAgent(await this.agentId(user.id), {
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      logType: type,
      search,
      httpStatus: httpStatus ? Number(httpStatus) : undefined,
      endpoint,
      dateFrom,
      dateTo,
    });
  }

  @Get('logs/:id')
  async logDetail(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    this.logService.logPartnerActivity(user.id, 'view_detail', { logId: id });
    return this.logService.getDetail(await this.agentId(user.id), id);
  }

  @Post('logs/export')
  async exportLogs(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { format?: 'csv' | 'excel' | 'json'; filters?: Record<string, unknown> },
  ) {
    const role = await this.role(user);
    if (role === 'READONLY') throw new ForbiddenException('Readonly không được xuất log');
    const agentId = await this.agentId(user.id);
    this.logService.logPartnerActivity(user.id, 'export', { format: body.format });
    return this.exportService.exportLogs(user.id, agentId, body.format ?? 'csv', body.filters ?? {});
  }

  @Get('logs/export/:jobId')
  async exportJob(@CurrentUser() user: AuthenticatedUser, @Param('jobId', ParseUUIDPipe) jobId: string) {
    return this.exportService.getJob(jobId, await this.agentId(user.id));
  }

  @Get('usage')
  async usage(
    @CurrentUser() user: AuthenticatedUser,
    @Query('period') period?: 'today' | '7d' | '30d',
  ) {
    return this.usageService.getUsage(await this.agentId(user.id), period ?? 'today');
  }

  @Get('error-codes')
  errorCodes() {
    return { items: API_ERROR_CODES };
  }

  @Post('test')
  async testApi(
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: {
      method: 'GET' | 'POST';
      path: string;
      apiKey: string;
      secretKey: string;
      requestId: string;
      body?: Record<string, unknown>;
    },
  ) {
    const role = await this.role(user);
    this.logService.logPartnerActivity(user.id, 'test', { path: body.path });
    return this.testService.execute(role, body);
  }
}
