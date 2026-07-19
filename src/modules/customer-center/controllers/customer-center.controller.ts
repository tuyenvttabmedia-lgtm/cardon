import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ChangePasswordDto, UpdateProfileDto } from '../../admin/dto/admin-operation.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import {
  CustomerNotificationQueryDto,
  CustomerOrderListQueryDto,
  CustomerPinListQueryDto,
  CustomerSearchQueryDto,
} from '../dto/customer-list-query.dto';
import { CustomerCenterService } from '../services/customer-center.service';

@Controller('customers/me')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER)
export class CustomerCenterController {
  constructor(private readonly customerCenter: CustomerCenterService) {}

  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.customerCenter.getDashboard(user.id);
  }

  @Get('orders')
  listOrders(@CurrentUser() user: AuthenticatedUser, @Query() query: CustomerOrderListQueryDto) {
    return this.customerCenter.listOrders(user.id, query);
  }

  @Get('orders/:id')
  orderDetail(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.customerCenter.getOrderDetail(user.id, id);
  }

  @Post('orders/:id/resend-email')
  resendEmail(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.customerCenter.resendOrderEmail(user.id, id);
  }

  @Get('pins')
  listPins(@CurrentUser() user: AuthenticatedUser, @Query() query: CustomerPinListQueryDto) {
    return this.customerCenter.listPins(user.id, query);
  }

  @Get('notifications')
  notifications(@CurrentUser() user: AuthenticatedUser, @Query() query: CustomerNotificationQueryDto) {
    return this.customerCenter.listNotifications(user.id, query);
  }

  @Delete('notifications/:id')
  deleteNotification(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.customerCenter.deleteNotification(user.id, id);
  }

  @Get('search')
  search(@CurrentUser() user: AuthenticatedUser, @Query() query: CustomerSearchQueryDto) {
    return this.customerCenter.search(user.id, query.q);
  }

  @Get('profile')
  profile(@CurrentUser() user: AuthenticatedUser) {
    return this.customerCenter.getProfile(user.id);
  }

  @Patch('profile')
  updateProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    return this.customerCenter.updateProfile(user.id, dto);
  }

  @Post('change-password')
  changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto) {
    return this.customerCenter.changePassword(user.id, dto);
  }

  @Get('security/sessions')
  sessions(@CurrentUser() user: AuthenticatedUser) {
    return this.customerCenter.listSessions(user.id);
  }

  @Post('security/revoke-others')
  revokeOthers(@CurrentUser() user: AuthenticatedUser) {
    return this.customerCenter.revokeOtherSessions(user.id);
  }

  @Post('support/tickets/:id/close')
  closeTicket(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.customerCenter.closeSupportTicket(user.id, id);
  }
}
