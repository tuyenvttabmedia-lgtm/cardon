import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ChangePasswordDto, UpdateProfileDto } from '../../admin/dto/admin-operation.dto';
import { CustomerOrderQueryDto, AccountListQueryDto } from '../../order/dto/customer-order-query.dto';
import { NotificationService } from '../../notification/services/notification.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { PlatformMaintenanceGuard } from '../../maintenance-center/guards/platform-maintenance.guard';
import { MaintenanceModule } from '../../maintenance-center/decorators/maintenance-module.decorator';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { AccountService } from '../services/account.service';

@Controller('account')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER)
export class AccountController {
  constructor(
    private readonly accountService: AccountService,
    private readonly notificationService: NotificationService,
  ) {}
  @Get('profile')
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.accountService.getProfile(user.id);
  }

  @Patch('profile')
  @MaintenanceModule('customer_api')
  @UseGuards(PlatformMaintenanceGuard)
  updateProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    return this.accountService.updateProfile(user.id, dto);
  }

  @Post('change-password')
  @MaintenanceModule('customer_api')
  @UseGuards(PlatformMaintenanceGuard)
  changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto) {
    return this.accountService.changePassword(user.id, dto);
  }

  @Get('orders')
  listOrders(@CurrentUser() user: AuthenticatedUser, @Query() query: CustomerOrderQueryDto) {
    return this.accountService.listOrders(
      user.id,
      query.tab ?? 'all',
      query.type,
      query.skip,
      query.take,
    );
  }

  @Get('cards')
  listCards(@CurrentUser() user: AuthenticatedUser, @Query() query: AccountListQueryDto) {
    return this.accountService.listPurchasedCards(user.id, query.skip, query.take);
  }

  @Get('topups')
  listTopups(@CurrentUser() user: AuthenticatedUser, @Query() query: AccountListQueryDto) {
    return this.accountService.listTopupHistory(user.id, query.skip, query.take);
  }

  @Get('data')
  listDataOrders(@CurrentUser() user: AuthenticatedUser) {
    return this.accountService.listDataHistory(user.id);
  }

  @Get('notifications')
  listNotifications(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationService.listUserNotifications(user.id);
  }

  @Get('notifications/unread-count')
  unreadNotificationCount(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationService.countUnreadUserNotifications(user.id).then((count) => ({ count }));
  }

  @Patch('notifications/:id/read')
  markNotificationRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notificationService.markUserNotificationRead(id, user.id);
  }

  @Patch('notifications/read-all')
  markAllNotificationsRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationService.markAllUserNotificationsRead(user.id);
  }
}
