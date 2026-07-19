import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { ActivityLogQueryDto } from '../dto/activity-log.dto';
import { ActivityLogService } from '../services/activity-log.service';

@Controller('admin/activity')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ActivityLogController {
  constructor(private readonly activityLogService: ActivityLogService) {}

  @Get()
  @Permissions('activity.read')
  findAll(@Query() query: ActivityLogQueryDto) {
    return this.activityLogService.findAll(query);
  }

  @Get('export/csv')
  @Permissions('activity.export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCsv(@Query() query: ActivityLogQueryDto, @Res() res: Response) {
    const { buffer, filename } = await this.activityLogService.exportCsv(query);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Get('export/excel')
  @Permissions('activity.export')
  async exportExcel(@Query() query: ActivityLogQueryDto, @Res() res: Response) {
    const { buffer, filename } = await this.activityLogService.exportExcel(query);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.send(buffer);
  }

  @Get(':id')
  @Permissions('activity.read')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.activityLogService.findOne(id);
  }
}
