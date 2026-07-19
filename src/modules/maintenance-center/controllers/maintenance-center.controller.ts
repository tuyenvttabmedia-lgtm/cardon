import { Body, Controller, Get, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import {
  extractClientIp,
  extractClientUserAgent,
} from '../../../common/utils/request-client.util';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import {
  MaintenancePreviewDto,
  MaintenanceScheduleApplyDto,
  UpdateMaintenanceDto,
} from '../dto/maintenance.dto';
import { MaintenanceCenterService } from '../services/maintenance-center.service';

@Controller('admin/maintenance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MaintenanceCenterController {
  constructor(private readonly maintenanceService: MaintenanceCenterService) {}

  @Get()
  @Permissions('maintenance.read')
  getDashboard() {
    return this.maintenanceService.getDashboard();
  }

  @Put()
  @Permissions('maintenance.manage')
  update(@Body() dto: UpdateMaintenanceDto, @CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.maintenanceService.update(user, dto, {
      ipAddress: extractClientIp(req),
      userAgent: extractClientUserAgent(req),
      correlationId: req.headers['x-correlation-id'] as string | undefined,
    });
  }

  @Post('preview')
  @Permissions('maintenance.read')
  preview(@Body() dto: MaintenancePreviewDto) {
    return this.maintenanceService.preview(dto);
  }

  @Post('schedule')
  @Permissions('maintenance.manage')
  applySchedule(
    @Body() dto: MaintenanceScheduleApplyDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.maintenanceService.applySchedule(user, dto, {
      ipAddress: extractClientIp(req),
      userAgent: extractClientUserAgent(req),
      correlationId: req.headers['x-correlation-id'] as string | undefined,
    });
  }
}
