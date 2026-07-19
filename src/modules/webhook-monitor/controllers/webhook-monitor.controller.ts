import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { WebhookSource } from '@prisma/client';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { activityContextFromRequest } from '../../activity-log/utils/activity-context.util';
import {
  WebhookCancelDto,
  WebhookExportQueryDto,
  WebhookHistoryQueryDto,
  WebhookListQueryDto,
  WebhookRetryBulkDto,
} from '../dto/webhook-monitor.dto';
import { WebhookMonitorExportService } from '../services/webhook-monitor-export.service';
import { WebhookMonitorService } from '../services/webhook-monitor.service';

@Controller('admin/webhooks')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WebhookMonitorController {
  constructor(
    private readonly webhookMonitorService: WebhookMonitorService,
    private readonly exportService: WebhookMonitorExportService,
  ) {}

  @Get()
  @Permissions('webhook.read')
  list(@Query() query: WebhookListQueryDto) {
    return this.webhookMonitorService.list(query);
  }

  @Get('statistics')
  @Permissions('webhook.read')
  statistics(@Query('source') source?: WebhookSource) {
    return this.webhookMonitorService.getStatistics(source);
  }

  @Get('history')
  @Permissions('webhook.read')
  history(@Query() query: WebhookHistoryQueryDto) {
    return this.webhookMonitorService.getHistory(query);
  }

  @Get('export/csv')
  @Permissions('webhook.export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCsv(@Query() query: WebhookExportQueryDto, @Res() res: Response) {
    const { buffer, filename } = await this.exportService.exportCsv(query);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Get('export/excel')
  @Permissions('webhook.export')
  async exportExcel(@Query() query: WebhookExportQueryDto, @Res() res: Response) {
    const { buffer, filename } = await this.exportService.exportExcel(query);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.send(buffer);
  }

  @Get('export/json')
  @Permissions('webhook.export')
  @Header('Content-Type', 'application/json; charset=utf-8')
  async exportJson(@Query() query: WebhookExportQueryDto, @Res() res: Response) {
    const { buffer, filename } = await this.exportService.exportJson(query);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Post('retry-failed')
  @Permissions('webhook.manage')
  retryFailed(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: WebhookRetryBulkDto,
    @Req() req: Request,
  ) {
    return this.webhookMonitorService.retryFailed(user, activityContextFromRequest(req), dto.ids);
  }

  @Post('cancel')
  @Permissions('webhook.manage')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: WebhookCancelDto,
    @Req() req: Request,
  ) {
    return this.webhookMonitorService.cancelWebhooks(dto.ids, user, activityContextFromRequest(req));
  }

  @Get(':id')
  @Permissions('webhook.read')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.webhookMonitorService.getById(id);
  }

  @Post(':id/retry')
  @Permissions('webhook.manage')
  retry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.webhookMonitorService.retryWebhook(id, user, activityContextFromRequest(req));
  }

  @Post(':id/log-copy')
  @Permissions('webhook.read')
  logCopy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('action') action: string,
    @Req() req: Request,
  ) {
    this.webhookMonitorService.logActivityCopy(
      user,
      activityContextFromRequest(req),
      action ?? 'copy',
      id,
    );
    return { ok: true };
  }
}
