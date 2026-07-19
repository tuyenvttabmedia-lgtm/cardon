import {

  Body,

  Controller,

  Delete,

  Get,

  Header,

  Param,

  Post,

  Query,

  Req,

  Res,

  UseGuards,

} from '@nestjs/common';

import type { Request, Response } from 'express';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';

import { Permissions } from '../../../common/decorators/permissions.decorator';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

import { PermissionsGuard } from '../../auth/guards/permissions.guard';

import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';

import { activityContextFromRequest } from '../../activity-log/utils/activity-context.util';

import {

  BulkJobsDto,

  JobQueueQueryDto,

  QueueCleanDto,

  QueueExportQueryDto,

  QueueHistoryQueryDto,

  QueueJobsQueryDto,

} from '../dto/queue-monitor.dto';

import { QueueMonitorExportService } from '../services/queue-monitor-export.service';

import { QueueMonitorService } from '../services/queue-monitor.service';



@Controller('admin')

@UseGuards(JwtAuthGuard, PermissionsGuard)

export class QueueMonitorController {

  constructor(

    private readonly queueMonitorService: QueueMonitorService,

    private readonly exportService: QueueMonitorExportService,

  ) {}



  @Get('queues')

  @Permissions('queue.read')

  listQueues() {

    return this.queueMonitorService.listQueues();

  }



  @Get('queues/:queue')

  @Permissions('queue.read')

  getQueue(@Param('queue') queue: string) {

    return this.queueMonitorService.getQueueDetail(queue);

  }



  @Get('queues/:queue/jobs')

  @Permissions('queue.read')

  listJobs(@Param('queue') queue: string, @Query() query: QueueJobsQueryDto) {

    return this.queueMonitorService.listJobs(queue, query);

  }



  @Get('queues/:queue/statistics')

  @Permissions('queue.read')

  statistics(@Param('queue') queue: string) {

    return this.queueMonitorService.getStatistics(queue);

  }



  @Get('queues/:queue/history')

  @Permissions('queue.read')

  history(@Param('queue') queue: string, @Query() query: QueueHistoryQueryDto) {

    return this.queueMonitorService.getHistory(queue, query);

  }



  @Get('queues/:queue/workers')

  @Permissions('queue.read')

  workers(@Param('queue') queue: string) {

    return this.queueMonitorService.getWorkers(queue);

  }



  @Get('queues/:queue/config')

  @Permissions('queue.read')

  config(@Param('queue') queue: string) {

    return this.queueMonitorService.getQueueConfig(queue);

  }



  @Get('queues/:queue/export/csv')

  @Permissions('queue.export')

  @Header('Content-Type', 'text/csv; charset=utf-8')

  async exportCsv(

    @Param('queue') queue: string,

    @Query() query: QueueExportQueryDto,

    @Res() res: Response,

  ) {

    const { buffer, filename } = await this.exportService.exportCsv(queue, query);

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    res.send(buffer);

  }



  @Get('queues/:queue/export/excel')

  @Permissions('queue.export')

  async exportExcel(

    @Param('queue') queue: string,

    @Query() query: QueueExportQueryDto,

    @Res() res: Response,

  ) {

    const { buffer, filename } = await this.exportService.exportExcel(queue, query);

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    res.setHeader(

      'Content-Type',

      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',

    );

    res.send(buffer);

  }



  @Get('queues/:queue/export/json')

  @Permissions('queue.export')

  @Header('Content-Type', 'application/json; charset=utf-8')

  async exportJson(

    @Param('queue') queue: string,

    @Query() query: QueueExportQueryDto,

    @Res() res: Response,

  ) {

    const { buffer, filename } = await this.exportService.exportJson(queue, query);

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    res.send(buffer);

  }



  @Post('queues/:queue/pause')

  @Permissions('queue.manage')

  pause(

    @CurrentUser() user: AuthenticatedUser,

    @Param('queue') queue: string,

    @Req() req: Request,

  ) {

    const ctx = activityContextFromRequest(req);

    return this.queueMonitorService.pauseQueue(queue, user, ctx);

  }



  @Post('queues/:queue/resume')

  @Permissions('queue.manage')

  resume(

    @CurrentUser() user: AuthenticatedUser,

    @Param('queue') queue: string,

    @Req() req: Request,

  ) {

    const ctx = activityContextFromRequest(req);

    return this.queueMonitorService.resumeQueue(queue, user, ctx);

  }



  @Post('queues/:queue/clean')

  @Permissions('queue.manage')

  clean(

    @CurrentUser() user: AuthenticatedUser,

    @Param('queue') queue: string,

    @Body() dto: QueueCleanDto,

    @Req() req: Request,

  ) {

    const ctx = activityContextFromRequest(req);

    return this.queueMonitorService.cleanQueue(queue, dto, user, ctx);

  }



  @Post('queues/:queue/retry-failed')

  @Permissions('queue.manage')

  retryAllFailed(

    @CurrentUser() user: AuthenticatedUser,

    @Param('queue') queue: string,

    @Req() req: Request,

  ) {

    const ctx = activityContextFromRequest(req);

    return this.queueMonitorService.retryAllFailed(queue, user, ctx);

  }



  @Post('queues/:queue/remove-completed')

  @Permissions('queue.manage')

  removeAllCompleted(

    @CurrentUser() user: AuthenticatedUser,

    @Param('queue') queue: string,

    @Req() req: Request,

  ) {

    const ctx = activityContextFromRequest(req);

    return this.queueMonitorService.removeAllCompleted(queue, user, ctx);

  }



  @Post('queues/:queue/jobs/bulk')

  @Permissions('queue.manage')

  bulkJobs(

    @CurrentUser() user: AuthenticatedUser,

    @Param('queue') queue: string,

    @Body() dto: BulkJobsDto,

    @Req() req: Request,

  ) {

    const ctx = activityContextFromRequest(req);

    return this.queueMonitorService.bulkJobs(queue, dto, user, ctx);

  }



  @Get('jobs/:id')

  @Permissions('queue.read')

  getJob(@Param('id') id: string, @Query() query: JobQueueQueryDto) {

    return this.queueMonitorService.getJob(query.queue, id);

  }



  @Post('jobs/:id/retry')

  @Permissions('queue.manage')

  retryJob(

    @CurrentUser() user: AuthenticatedUser,

    @Param('id') id: string,

    @Query() query: JobQueueQueryDto,

    @Req() req: Request,

  ) {

    const ctx = activityContextFromRequest(req);

    return this.queueMonitorService.retryJob(query.queue, id, user, ctx);

  }



  @Post('jobs/:id/promote')

  @Permissions('queue.manage')

  promoteJob(

    @CurrentUser() user: AuthenticatedUser,

    @Param('id') id: string,

    @Query() query: JobQueueQueryDto,

    @Req() req: Request,

  ) {

    const ctx = activityContextFromRequest(req);

    return this.queueMonitorService.promoteJob(query.queue, id, user, ctx);

  }



  @Delete('jobs/:id')

  @Permissions('queue.manage')

  removeJob(

    @CurrentUser() user: AuthenticatedUser,

    @Param('id') id: string,

    @Query() query: JobQueueQueryDto,

    @Req() req: Request,

  ) {

    const ctx = activityContextFromRequest(req);

    return this.queueMonitorService.removeJob(query.queue, id, user, ctx);

  }

}

