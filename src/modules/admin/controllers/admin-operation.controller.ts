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
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { extractClientIp, extractClientUserAgent } from '../../../common/utils/request-client.util';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AgentInviteService } from '../../agent/services/agent-invite.service';
import { RbacService } from '../../rbac/rbac.service';
import {
  AdminCreateAgentInviteDto,
  AdminCreateStaffDto,
  AdminCustomerDetailQueryDto,
  AdminCustomerQueryDto,
  AdminResetCustomerPasswordDto,
  AdminSearchQueryDto,
  AdminUpdateCustomerDto,
  AdminUpdateStaffDto,
} from '../dto/admin-operation.dto';
import { ADMIN_PERMISSIONS } from '../entities/admin.constants';
import { AdminAgentInviteService } from '../services/admin-agent-invite.service';
import { AdminCustomerService } from '../services/admin-customer.service';
import { AdminOrderDetailService } from '../services/admin-order-detail.service';
import { AdminSearchService } from '../services/admin-search.service';
import { AdminStaffService } from '../services/admin-staff.service';
@Controller('admin')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdminOperationController {
  constructor(
    private readonly orderDetailService: AdminOrderDetailService,
    private readonly searchService: AdminSearchService,
    private readonly customerService: AdminCustomerService,
    private readonly staffService: AdminStaffService,
    private readonly agentInviteService: AdminAgentInviteService,
    private readonly agentRegistrationService: AgentInviteService,
    private readonly rbacService: RbacService,
  ) {}

  @Get('search')
  @Permissions(
    'orders.read',
    'customers.read',
    'payments.view',
    'providers.manage',
    'finance.view',
    'users.read',
  )
  async search(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AdminSearchQueryDto,
  ) {
    const permissions = await this.rbacService.getPermissionsForRole(user.role);
    return this.searchService.search(query.q, permissions);
  }

  @Get('orders/:id/detail')
  @Permissions('orders.read')
  getOrderDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('gatewayTransaction') gatewayTransaction?: string,
    @Req() req?: Request,
  ) {
    return this.orderDetailService.getOrderDetail(id, {
      gatewayTransaction,
      adminId: user.id,
      adminRole: user.role,
      ip: req ? extractClientIp(req) : null,
      userAgent: req ? extractClientUserAgent(req) : null,
    });
  }

  @Post('orders/:orderId/cards/:cardId/pin-viewed')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Permissions('orders.read')
  recordPinViewed(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Req() req: Request,
  ) {
    return this.orderDetailService.recordPinViewed({
      orderId,
      cardId,
      adminId: user.id,
      adminRole: user.role,
      ip: extractClientIp(req),
      userAgent: extractClientUserAgent(req),
    });
  }

  @Post('orders/:orderId/cards/:cardId/pin-copied')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Permissions('orders.read')
  recordPinCopied(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Req() req: Request,
  ) {
    return this.orderDetailService.recordPinCopied({
      orderId,
      cardId,
      adminId: user.id,
      adminRole: user.role,
      ip: extractClientIp(req),
      userAgent: extractClientUserAgent(req),
    });
  }

  @Get('orders/:orderId/delivery/export')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Permissions('orders.read')
  async exportDelivery(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const result = await this.orderDetailService.exportDeliveryExcel({
      orderId,
      adminId: user.id,
      adminRole: user.role,
      ip: extractClientIp(req),
      userAgent: extractClientUserAgent(req),
    });
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.buffer);
  }

  @Get('customers')
  @Permissions(ADMIN_PERMISSIONS.CUSTOMERS_READ)
  listCustomers(@Query() query: AdminCustomerQueryDto) {
    return this.customerService.listCustomers(query);
  }

  @Get('customers/:id')
  @Permissions(ADMIN_PERMISSIONS.CUSTOMERS_READ)
  getCustomer(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: AdminCustomerDetailQueryDto,
  ) {
    return this.customerService.getCustomer(id, query);
  }

  @Patch('customers/:id')
  @Permissions(ADMIN_PERMISSIONS.CUSTOMERS_MANAGE)
  updateCustomer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminUpdateCustomerDto,
  ) {
    return this.customerService.updateCustomer(user.id, id, dto);
  }

  @Post('customers/:id/lock')
  @Permissions(ADMIN_PERMISSIONS.CUSTOMERS_MANAGE)
  lockCustomer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.customerService.lockCustomer(user.id, id);
  }

  @Post('customers/:id/unlock')
  @Permissions(ADMIN_PERMISSIONS.CUSTOMERS_MANAGE)
  unlockCustomer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.customerService.unlockCustomer(user.id, id);
  }

  @Post('customers/:id/reset-password')
  @Permissions(ADMIN_PERMISSIONS.CUSTOMERS_MANAGE)
  resetCustomerPassword(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminResetCustomerPasswordDto,
  ) {
    return this.customerService.resetCustomerPassword(user.id, id, dto.mode ?? 'link');
  }

  @Get('staff')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @Permissions(ADMIN_PERMISSIONS.USERS_MANAGE)
  listStaff() {
    return this.staffService.listStaff();
  }

  @Post('staff')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @Permissions(ADMIN_PERMISSIONS.USERS_MANAGE)
  createStaff(@CurrentUser() user: AuthenticatedUser, @Body() dto: AdminCreateStaffDto) {
    return this.staffService.createStaff(user.id, dto);
  }

  @Patch('staff/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @Permissions(ADMIN_PERMISSIONS.USERS_MANAGE)
  updateStaff(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminUpdateStaffDto,
  ) {
    return this.staffService.updateStaff(user.id, id, dto);
  }

  @Post('staff/:id/disable')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @Permissions(ADMIN_PERMISSIONS.USERS_MANAGE)
  disableStaff(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.staffService.disableStaff(user.id, id);
  }

  @Post('staff/:id/enable')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @Permissions(ADMIN_PERMISSIONS.USERS_MANAGE)
  enableStaff(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.staffService.enableStaff(user.id, id);
  }

  @Delete('staff/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @Permissions(ADMIN_PERMISSIONS.USERS_MANAGE)
  deleteStaff(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.staffService.deleteStaff(user.id, id);
  }

  @Post('staff/:id/reset-password')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @Permissions(ADMIN_PERMISSIONS.USERS_MANAGE)
  resetStaffPassword(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.staffService.resetStaffPassword(user.id, id);
  }

  @Post('agent-invites')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Permissions('agents.manage')
  createAgentInvite(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AdminCreateAgentInviteDto,
  ) {
    return this.agentInviteService.createInvite(user.id, dto);
  }

  @Get('agent-registration-mode')
  @Permissions('agents.manage')
  getAgentRegistrationMode() {
    return { mode: this.agentRegistrationService.getRegistrationMode() };
  }
}
