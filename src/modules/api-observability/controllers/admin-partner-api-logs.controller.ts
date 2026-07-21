import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { AgentApiRequestLogService } from '../services/agent-api-request-log.service';

@Controller('admin/partner-api-logs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdminPartnerApiLogsController {
  constructor(private readonly logService: AgentApiRequestLogService) {}

  @Get()
  @Permissions('webhook.read')
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('agentId') agentId?: string,
    @Query('search') search?: string,
    @Query('httpStatus') httpStatus?: string,
  ) {
    return this.logService.adminList({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      agentId,
      search,
      httpStatus: httpStatus ? Number(httpStatus) : undefined,
    });
  }

  @Get(':id')
  @Permissions('webhook.read')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.logService.adminGet(id);
  }
}
