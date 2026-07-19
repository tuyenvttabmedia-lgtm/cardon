import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { SystemAuditAction, SystemAuditResource, SystemActivityEventCategory, SystemActivityEventType, SystemActivitySeverity, SystemActivitySource, UserRole } from '@prisma/client';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { extractClientIp, extractClientUserAgent } from '../../../common/utils/request-client.util';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { Audit } from '../../audit-log/decorators/audit.decorator';
import { AuditSnapshotKey } from '../../audit-log/entities/audit-log.constants';
import { ActivityEventDispatcher } from '../../activity-event/activity-event-dispatcher.service';
import { activityContextFromRequest } from '../../activity-log/utils/activity-context.util';
import {
  AdminAgentQueryDto,
  AdminAuditLogQueryDto,
  AdminOrderQueryDto,
  AdminPaymentQueryDto,
  AdminProviderTransactionQueryDto,
  OrderManualRecoveryDto,
  ProviderRuntimeSettingsDto,
  ProviderAlertSettingsDto,
  CopyOrderSerialDto,
  AdminSuspendAgentDto,
  AdminUpdateAgentDto,
  ResolvePaymentReviewDto,
} from '../dto/admin.dto';
import { ADMIN_PERMISSIONS } from '../entities/admin.constants';
import { AdminAgentService } from '../services/admin-agent.service';
import { AdminAuditLogService } from '../services/admin-audit-log.service';
import { AdminDashboardService } from '../services/admin-dashboard.service';
import { AdminOrderService } from '../services/admin-order.service';
import { AdminOrderDetailService } from '../services/admin-order-detail.service';
import { AdminPaymentService } from '../services/admin-payment.service';
import { AdminProviderService } from '../services/admin-provider.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdminController {
  constructor(
    private readonly dashboardService: AdminDashboardService,
    private readonly orderService: AdminOrderService,
    private readonly orderDetailService: AdminOrderDetailService,
    private readonly paymentService: AdminPaymentService,
    private readonly providerService: AdminProviderService,
    private readonly agentService: AdminAgentService,
    private readonly auditLogService: AdminAuditLogService,
    private readonly activityDispatcher: ActivityEventDispatcher,
  ) {}

  @Get('dashboard')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Permissions(ADMIN_PERMISSIONS.DASHBOARD)
  getDashboard() {
    return this.dashboardService.getDashboard();
  }

  @Get('orders/summary')
  @Permissions('orders.read')
  getOrdersSummary(@Query() query: AdminOrderQueryDto) {
    return this.orderService.getOrdersSummary(query);
  }

  @Get('orders')
  @Permissions('orders.read')
  listOrders(@Query() query: AdminOrderQueryDto) {
    return this.orderService.listOrders(query);
  }

  @Get('orders/:id')
  @Permissions('orders.read')
  getOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.orderDetailService.getOrderWithDelivery(id, {
      adminId: user.id,
      adminRole: user.role,
      ip: extractClientIp(req),
      userAgent: extractClientUserAgent(req),
    });
  }

  @Post('orders/:id/retry')
  @Permissions('orders.retry')
  retryOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orderService.retryFulfillment(user.id, id);
  }

  @Post('orders/:id/recovery')
  @Permissions('orders.retry')
  orderManualRecovery(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OrderManualRecoveryDto,
  ) {
    return this.orderService.manualRecovery(user.id, id, dto);
  }

  @Get('payments/manual-review')
  @Permissions(ADMIN_PERMISSIONS.PAYMENTS_REVIEW)
  listManualReviewPayments() {
    return this.paymentService.listManualReview();
  }

  @Get('payments')
  @Permissions('payments.view')
  listPayments(@Query() query: AdminPaymentQueryDto) {
    return this.paymentService.listPayments(query);
  }

  @Post('payments/:id/resolve')
  @Permissions(ADMIN_PERMISSIONS.PAYMENTS_REVIEW)
  resolvePaymentReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolvePaymentReviewDto,
  ) {
    return this.paymentService.resolveManualReview(user.id, id, dto);
  }

  @Get('providers/status')
  @Permissions('providers.manage')
  getProvidersStatus() {
    return this.providerService.getProvidersStatus();
  }

  @Get('providers/:id/transactions')
  @Permissions('providers.manage')
  listProviderTransactions(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: AdminProviderTransactionQueryDto,
  ) {
    return this.providerService.listTransactions(id, query);
  }

  @Post('providers/:id/sync-products')
  @Permissions('providers.manage')
  syncProviderProducts(@Param('id', ParseUUIDPipe) id: string) {
    return this.providerService.syncProducts(id);
  }

  @Post('providers/:id/check-balance')
  @Permissions('providers.manage')
  checkProviderBalance(@Param('id', ParseUUIDPipe) id: string) {
    return this.providerService.checkBalance(id);
  }

  @Get('providers/:id')
  @Permissions('providers.manage')
  getProviderDetail(@Param('id', ParseUUIDPipe) id: string) {
    return this.providerService.getProviderDetail(id);
  }

  @Post('providers/:id/test-connection')
  @Permissions('providers.manage')
  testProviderConnection(@Param('id', ParseUUIDPipe) id: string) {
    return this.providerService.testConnection(id);
  }

  @Get('providers/:id/runtime-settings')
  @Permissions('providers.manage')
  getProviderRuntimeSettings(@Param('id', ParseUUIDPipe) id: string) {
    return this.providerService.getRuntimeSettings(id);
  }

  @Put('providers/:id/runtime-settings')
  @Permissions('providers.manage')
  @Audit({
    resource: SystemAuditResource.PROVIDER,
    action: SystemAuditAction.UPDATE,
    snapshot: AuditSnapshotKey.PROVIDER_RUNTIME,
    resourceIdParam: 'id',
    reasonField: 'reason',
    detectEnableDisable: true,
  })
  updateProviderRuntimeSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProviderRuntimeSettingsDto,
    @Req() req: Request,
  ) {
    return this.providerService
      .updateRuntimeSettings(id, {
        maintenanceMode: dto.maintenanceMode ?? false,
        reason: dto.reason,
        startAt: dto.startAt,
        endAt: dto.endAt,
      })
      .then((result) => {
        if (dto.maintenanceMode) {
          const ctx = activityContextFromRequest(req);
          this.activityDispatcher.dispatch({
            eventType: SystemActivityEventType.MAINTENANCE_ENABLED,
            eventCategory: SystemActivityEventCategory.PROVIDER,
            severity: SystemActivitySeverity.WARNING,
            source: SystemActivitySource.ADMIN,
            resource: 'provider',
            resourceId: id,
            resourceDisplay: id.slice(0, 8),
            title: 'Maintenance Enabled',
            description: dto.reason ?? 'Provider maintenance mode enabled',
            performedBy: user.id,
            performedEmail: user.email,
            performedRole: user.role,
            ipAddress: ctx.ipAddress ?? null,
            userAgent: ctx.userAgent ?? null,
            correlationId: ctx.correlationId ?? null,
            metadata: { reason: dto.reason, startAt: dto.startAt, endAt: dto.endAt },
          });
        }
        return result;
      });
  }

  @Get('providers/:id/alert-settings')
  @Permissions('providers.manage')
  getProviderAlertSettings(@Param('id', ParseUUIDPipe) id: string) {
    return this.providerService.getAlertSettings(id);
  }

  @Put('providers/:id/alert-settings')
  @Permissions('providers.manage')
  updateProviderAlertSettings(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProviderAlertSettingsDto,
  ) {
    return this.providerService.updateAlertSettings(id, dto);
  }

  @Post('orders/:id/resend-email')
  @Permissions('orders.retry')
  resendOrderEmail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orderService.resendDeliveryEmail(user.id, id);
  }

  @Post('orders/:id/retry-delivery')
  @Permissions('orders.retry')
  retryOrderDelivery(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orderService.retryDelivery(user.id, id);
  }

  @Post('orders/:id/copy-serial')
  @Permissions('cards.reveal')
  async copyOrderSerial(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CopyOrderSerialDto,
    @Req() req: Request,
  ) {
    const result = await this.orderService.copyCardSerial(user.id, id, dto.cardRecordId);
    const ctx = activityContextFromRequest(req);
    this.activityDispatcher.dispatch({
      eventType: SystemActivityEventType.DOWNLOAD_PIN,
      eventCategory: SystemActivityEventCategory.ORDER,
      severity: SystemActivitySeverity.WARNING,
      source: SystemActivitySource.ADMIN,
      resource: 'order',
      resourceId: id,
      resourceDisplay: id.slice(0, 8),
      title: 'Download Card PIN',
      description: `Card record ${dto.cardRecordId.slice(0, 8)}…`,
      performedBy: user.id,
      performedEmail: user.email,
      performedRole: user.role,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
      correlationId: ctx.correlationId ?? null,
      metadata: { orderId: id, cardRecordId: dto.cardRecordId },
    });
    return result;
  }

  @Get('agents')
  @Permissions('users.read')
  listAgents(@Query() query: AdminAgentQueryDto) {
    return this.agentService.listAgents(query);
  }

  @Get('agents/:id')
  @Permissions('users.read')
  getAgent(@Param('id', ParseUUIDPipe) id: string) {
    return this.agentService.getAgent(id);
  }

  @Post('agents/:id/suspend')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Permissions('agents.manage')
  suspendAgent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminSuspendAgentDto,
  ) {
    return this.agentService.suspendAgent(user.id, id, dto);
  }

  @Post('agents/:id/reactivate')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Permissions('agents.manage')
  reactivateAgent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.agentService.reactivateAgent(user.id, id);
  }

  @Patch('agents/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Permissions('agents.manage')
  updateAgent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminUpdateAgentDto,
  ) {
    return this.agentService.updateAgent(user.id, id, dto);
  }

  @Delete('agents/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Permissions('agents.manage')
  deleteAgent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.agentService.deleteAgent(user.id, id);
  }

  @Post('agents/:id/enable-api')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Permissions('agents.manage')
  enableAgentApi(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.agentService.enableApi(user.id, id);
  }

  @Post('agents/:id/disable-api')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Permissions('agents.manage')
  disableAgentApi(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.agentService.disableApi(user.id, id);
  }

  @Post('agents/:id/api-keys/rotate')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SUPPORT)
  @Permissions('agents.manage')
  rotateAgentApiKeys(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.agentService.rotateApiKey(user.id, id);
  }

  @Get('audit-logs')
  @Permissions(ADMIN_PERMISSIONS.AUDIT_VIEW)
  listAuditLogs(@Query() query: AdminAuditLogQueryDto) {
    return this.auditLogService.listAuditLogs(query);
  }
}
