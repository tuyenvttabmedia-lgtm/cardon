import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import {
  BulkDismissDto,
  SystemNotificationQueryDto,
} from '../dto/system-notification.dto';
import { SystemNotificationService } from '../services/system-notification.service';

@Controller('admin/notifications')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SystemNotificationController {
  constructor(private readonly notificationService: SystemNotificationService) {}

  @Get()
  @Permissions('notification.read')
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: SystemNotificationQueryDto) {
    return this.notificationService.list(user.id, user.role, query);
  }

  @Get('unread-count')
  @Permissions('notification.read')
  unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationService.unreadCount(user.id, user.role);
  }

  @Get('export/csv')
  @Permissions('notification.manage')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SystemNotificationQueryDto,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.notificationService.exportCsv(
      user.id,
      user.role,
      query,
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Get('export/excel')
  @Permissions('notification.manage')
  async exportExcel(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SystemNotificationQueryDto,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.notificationService.exportExcel(
      user.id,
      user.role,
      query,
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.send(buffer);
  }

  @Patch('read-all')
  @Permissions('notification.read')
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationService.markAllRead(user.id, user.role);
  }

  @Patch('dismiss')
  @Permissions('notification.manage')
  dismiss(@CurrentUser() user: AuthenticatedUser, @Body() dto: BulkDismissDto) {
    return this.notificationService.dismiss(dto.ids ?? [], user.id, user.role);
  }

  @Get(':id')
  @Permissions('notification.read')
  async findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    const row = await this.notificationService.getOne(id, user.id, user.role);
    if (!row) {
      return { found: false };
    }
    return row;
  }

  @Patch(':id/read')
  @Permissions('notification.read')
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notificationService.markRead(id, user.id, user.role);
  }
}
