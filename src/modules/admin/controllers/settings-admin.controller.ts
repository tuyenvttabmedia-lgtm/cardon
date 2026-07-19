import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  SystemActivityEventCategory,
  SystemActivityEventType,
  SystemActivitySeverity,
  SystemActivitySource,
  SystemAuditAction,
  SystemAuditResource,
  UserRole,
} from '@prisma/client';
import { Request } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { Audit } from '../../audit-log/decorators/audit.decorator';
import { AuditSnapshotKey } from '../../audit-log/entities/audit-log.constants';
import { ActivityEventDispatcher } from '../../activity-event/activity-event-dispatcher.service';
import { activityContextFromRequest } from '../../activity-log/utils/activity-context.util';
import { SettingsStoreService } from '../../settings/services/settings-store.service';
import {
  TestSmtpDto,
  UpdatePaymentGatewayDto,
  UpdatePaymentMethodsDto,
  UpdatePaymentRuntimeDto,
  UpdatePaymentStrategyDto,
  UpdatePaymentGatewayRuntimeDto,
  UpdateProviderEsaleDto,
  UpdateSmtpSettingsDto,
  UpdateSystemSettingsDto,
  UpdateOrderSettingsDto,
  UpdateTelegramSettingsDto,
} from '../dto/settings.dto';
import { SettingsAdminService } from '../services/settings-admin.service';

@Controller('admin/settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class SettingsAdminController {
  constructor(
    private readonly settingsAdminService: SettingsAdminService,
    private readonly activityDispatcher: ActivityEventDispatcher,
    private readonly settingsStore: SettingsStoreService,
  ) {}

  @Get('payment/megapay')
  getMegapay() {
    return this.settingsAdminService.getPaymentMegapay();
  }

  @Put('payment/megapay')
  @Audit({
    resource: SystemAuditResource.PAYMENT_GATEWAY,
    action: SystemAuditAction.UPDATE,
    snapshot: AuditSnapshotKey.PAYMENT_MEGAPAY,
    detectEnableDisable: true,
  })
  updateMegapay(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePaymentGatewayDto,
  ) {
    return this.settingsAdminService.updatePaymentMegapay(user.id, dto);
  }

  @Get('payment/sepay')
  getSepay() {
    return this.settingsAdminService.getPaymentSepay();
  }

  @Put('payment/sepay')
  @Audit({
    resource: SystemAuditResource.PAYMENT_GATEWAY,
    action: SystemAuditAction.UPDATE,
    snapshot: AuditSnapshotKey.PAYMENT_SEPAY,
    detectEnableDisable: true,
  })
  updateSepay(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePaymentGatewayDto,
  ) {
    return this.settingsAdminService.updatePaymentSepay(user.id, dto);
  }

  @Get('payment/methods')
  getPaymentMethods() {
    return this.settingsAdminService.getPaymentMethods();
  }

  @Put('payment/methods')
  @Audit({
    resource: SystemAuditResource.PAYMENT_GATEWAY,
    action: SystemAuditAction.UPDATE,
    snapshot: AuditSnapshotKey.PAYMENT_METHODS,
  })
  updatePaymentMethods(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePaymentMethodsDto,
  ) {
    return this.settingsAdminService.updatePaymentMethods(user.id, dto);
  }

  @Post('payment/reload')
  reloadPayment() {
    return this.settingsAdminService.reloadAll();
  }

  @Get('payment/runtime')
  getPaymentRuntime() {
    return this.settingsAdminService.getPaymentRuntime();
  }

  @Put('payment/runtime')
  @Audit({
    resource: SystemAuditResource.PAYMENT_GATEWAY,
    action: SystemAuditAction.UPDATE,
    snapshot: AuditSnapshotKey.PAYMENT_RUNTIME,
  })
  updatePaymentRuntime(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePaymentRuntimeDto,
  ) {
    return this.settingsAdminService.updatePaymentRuntime(user.id, dto);
  }

  @Get('payment/strategy')
  getPaymentStrategy() {
    return this.settingsAdminService.getPaymentStrategy();
  }

  @Put('payment/strategy')
  @Audit({
    resource: SystemAuditResource.PAYMENT_GATEWAY,
    action: SystemAuditAction.UPDATE,
    snapshot: AuditSnapshotKey.PAYMENT_STRATEGY,
    detectEnableDisable: true,
  })
  updatePaymentStrategy(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePaymentStrategyDto,
  ) {
    return this.settingsAdminService.updatePaymentStrategy(user.id, dto);
  }

  @Get('payment/gateways/:code/runtime')
  getPaymentGatewayRuntime(@Param('code') code: 'MEGAPAY' | 'SEPAY') {
    return this.settingsAdminService.getPaymentGatewayRuntime(code);
  }

  @Put('payment/gateways/:code/runtime')
  @Audit({
    resource: SystemAuditResource.PAYMENT_GATEWAY,
    action: SystemAuditAction.UPDATE,
    snapshot: AuditSnapshotKey.PAYMENT_GATEWAY_RUNTIME,
    resourceIdParam: 'code',
    detectEnableDisable: true,
  })
  updatePaymentGatewayRuntime(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code') code: 'MEGAPAY' | 'SEPAY',
    @Body() dto: UpdatePaymentGatewayRuntimeDto,
  ) {
    return this.settingsAdminService.updatePaymentGatewayRuntime(user.id, code, dto);
  }

  @Get('provider/esale')
  getEsale() {
    return this.settingsAdminService.getProviderEsale();
  }

  @Put('provider/esale')
  @Audit({
    resource: SystemAuditResource.PROVIDER,
    action: SystemAuditAction.UPDATE,
    snapshot: AuditSnapshotKey.PROVIDER_ESALE,
    detectEnableDisable: true,
  })
  updateEsale(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProviderEsaleDto,
  ) {
    return this.settingsAdminService.updateProviderEsale(user.id, dto);
  }

  @Post('provider/esale/test-connection')
  testEsaleConnection() {
    return this.settingsAdminService.testEsaleConnection();
  }

  @Post('provider/esale/check-balance')
  checkEsaleBalance() {
    return this.settingsAdminService.checkEsaleBalance();
  }

  @Post('provider/esale/sync-products')
  async syncEsaleProducts(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const ctx = activityContextFromRequest(req);
    try {
      const result = await this.settingsAdminService.syncEsaleProducts();
      this.activityDispatcher.dispatch({
        eventType: SystemActivityEventType.PROVIDER_SYNC,
        eventCategory: SystemActivityEventCategory.PROVIDER,
        severity: SystemActivitySeverity.SUCCESS,
        source: SystemActivitySource.ADMIN,
        resource: 'provider',
        resourceDisplay: 'eSale',
        title: 'Provider Sync',
        description: 'Manual eSale product sync completed',
        performedBy: user.id,
        performedEmail: user.email,
        performedRole: user.role,
        ipAddress: ctx.ipAddress ?? null,
        userAgent: ctx.userAgent ?? null,
        correlationId: ctx.correlationId ?? null,
        metadata: { result: result as unknown as Record<string, unknown> },
      });
      return result;
    } catch (error) {
      this.activityDispatcher.dispatch({
        eventType: SystemActivityEventType.PROVIDER_SYNC_FAILED,
        eventCategory: SystemActivityEventCategory.PROVIDER,
        severity: SystemActivitySeverity.ERROR,
        source: SystemActivitySource.ADMIN,
        resource: 'provider',
        resourceDisplay: 'eSale',
        title: 'Provider Sync Failed',
        description: error instanceof Error ? error.message : 'Sync failed',
        performedBy: user.id,
        performedEmail: user.email,
        performedRole: user.role,
        ipAddress: ctx.ipAddress ?? null,
        userAgent: ctx.userAgent ?? null,
        correlationId: ctx.correlationId ?? null,
      });
      throw error;
    }
  }

  @Get('smtp')
  getSmtp() {
    return this.settingsAdminService.getSmtp();
  }

  @Put('smtp')
  @Audit({
    resource: SystemAuditResource.SMTP,
    action: SystemAuditAction.UPDATE,
    snapshot: AuditSnapshotKey.SMTP,
    detectEnableDisable: true,
  })
  updateSmtp(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateSmtpSettingsDto,
  ) {
    return this.settingsAdminService.updateSmtp(user.id, dto);
  }

  @Post('smtp/test')
  async testSmtp(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TestSmtpDto,
    @Req() req: Request,
  ) {
    const ctx = activityContextFromRequest(req);
    const smtp = this.settingsStore.getSmtpAdminView();
    const host = String(smtp.host ?? 'smtp');
    const started = Date.now();

    this.activityDispatcher.dispatch({
      eventType: SystemActivityEventType.SMTP_TEST,
      eventCategory: SystemActivityEventCategory.EMAIL,
      severity: SystemActivitySeverity.INFO,
      source: SystemActivitySource.ADMIN,
      resource: 'smtp',
      resourceDisplay: host,
      title: 'SMTP Test',
      description: `Testing SMTP to ${dto.to}`,
      performedBy: user.id,
      performedEmail: user.email,
      performedRole: user.role,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
      correlationId: ctx.correlationId ?? null,
      metadata: { to: dto.to, host },
    });

    try {
      const result = await this.settingsAdminService.testSmtp(user.id, dto);
      const latencyMs = Date.now() - started;
      this.activityDispatcher.dispatch({
        eventType: SystemActivityEventType.SMTP_SUCCESS,
        eventCategory: SystemActivityEventCategory.EMAIL,
        severity: SystemActivitySeverity.SUCCESS,
        source: SystemActivitySource.ADMIN,
        resource: 'smtp',
        resourceDisplay: host,
        title: 'SMTP Success',
        description: `Latency ${latencyMs} ms`,
        performedBy: user.id,
        performedEmail: user.email,
        performedRole: user.role,
        ipAddress: ctx.ipAddress ?? null,
        userAgent: ctx.userAgent ?? null,
        correlationId: ctx.correlationId ?? null,
        metadata: { latencyMs, messageId: result.messageId },
      });
      return result;
    } catch (error) {
      this.activityDispatcher.dispatch({
        eventType: SystemActivityEventType.SMTP_FAILED,
        eventCategory: SystemActivityEventCategory.EMAIL,
        severity: SystemActivitySeverity.ERROR,
        source: SystemActivitySource.ADMIN,
        resource: 'smtp',
        resourceDisplay: host,
        title: 'SMTP Failed',
        description: error instanceof Error ? error.message : 'SMTP test failed',
        performedBy: user.id,
        performedEmail: user.email,
        performedRole: user.role,
        ipAddress: ctx.ipAddress ?? null,
        userAgent: ctx.userAgent ?? null,
        correlationId: ctx.correlationId ?? null,
      });
      throw error;
    }
  }

  @Get('system')
  getSystem() {
    return this.settingsAdminService.getSystem();
  }

  @Put('system')
  @Audit({
    resource: SystemAuditResource.FEATURE_FLAG,
    action: SystemAuditAction.UPDATE,
    snapshot: AuditSnapshotKey.SYSTEM,
    detectEnableDisable: true,
  })
  updateSystem(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateSystemSettingsDto,
  ) {
    return this.settingsAdminService.updateSystem(user.id, dto);
  }

  @Get('order')
  getOrder() {
    return this.settingsAdminService.getOrder();
  }

  @Put('order')
  @Audit({
    resource: SystemAuditResource.SETTING,
    action: SystemAuditAction.UPDATE,
    snapshot: AuditSnapshotKey.ORDER,
  })
  updateOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateOrderSettingsDto,
  ) {
    return this.settingsAdminService.updateOrder(user.id, dto);
  }

  @Get('telegram')
  getTelegram() {
    return this.settingsAdminService.getTelegram();
  }

  @Put('telegram')
  @Audit({
    resource: SystemAuditResource.SETTING,
    action: SystemAuditAction.UPDATE,
    snapshot: AuditSnapshotKey.TELEGRAM,
    detectEnableDisable: true,
  })
  updateTelegram(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateTelegramSettingsDto,
  ) {
    return this.settingsAdminService.updateTelegram(user.id, dto);
  }

  @Post('reload')
  reloadAll() {
    return this.settingsAdminService.reloadAll();
  }
}
