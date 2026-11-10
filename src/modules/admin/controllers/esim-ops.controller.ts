import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuditTargetType, UserRole } from '@prisma/client';
import type { Request } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { extractClientIp, extractClientUserAgent } from '../../../common/utils/request-client.util';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { EsimAdminService } from '../../esim/esim-admin.service';
import { EsimOrderService } from '../../esim/esim-order.service';
import { EsimTopupService } from '../../esim/esim-topup.service';
import { canAdminViewPin } from '../entities/card-pin.util';
import { ADMIN_AUDIT_ACTIONS } from '../entities/admin.constants';
import { AdminEsimTestOrderDto, EsimOpsAttemptQueryDto, EsimOpsDashboardQueryDto, EsimOpsOrderQueryDto, EsimOpsPaymentQueryDto } from '../dto/esim-ops.dto';
import { AdminAuditService } from '../services/admin-audit.service';
import { AdminOrderService } from '../services/admin-order.service';

@Controller('admin/esim-ops')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EsimOpsAdminController {
  constructor(
    private readonly esimAdmin: EsimAdminService,
    private readonly orderService: AdminOrderService,
    private readonly esimOrders: EsimOrderService,
    private readonly esimTopups: EsimTopupService,
    private readonly adminAudit: AdminAuditService,
  ) {}

  @Get('health')
  @Permissions('orders.read')
  health() {
    return this.esimAdmin.getHealth();
  }

  @Get('dashboard')
  @Permissions('orders.read')
  dashboard(@Query() query: EsimOpsDashboardQueryDto) {
    return this.esimAdmin.getOpsDashboard(query);
  }

  @Post('orders')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @Permissions('orders.manage')
  async createTestOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AdminEsimTestOrderDto,
    @Req() req: Request,
  ) {
    const order = await this.esimOrders.createAdminTest(
      {
        items: [{ variantId: dto.variantId, quantity: 1 }],
        paymentMethodCode: dto.paymentMethodCode,
        market: dto.market ?? 'VN',
      },
      user,
      { ip: extractClientIp(req), userAgent: extractClientUserAgent(req) },
      dto.testAmountUsd,
    );
    await this.adminAudit.record(
      user.id,
      ADMIN_AUDIT_ACTIONS.ADMIN_ESIM_TEST_ORDER_CREATED,
      AuditTargetType.ORDER,
      order.id,
      { orderCode: order.orderCode, variantId: dto.variantId, adminTest: true },
      extractClientIp(req) ?? undefined,
    );
    return order;
  }

  @Get('orders')
  @Permissions('orders.read')
  list(@Query() query: EsimOpsOrderQueryDto) {
    return this.esimAdmin.listOps(query);
  }

  @Get('orders/export')
  @Permissions('orders.read')
  exportOrders(@Query() query: EsimOpsOrderQueryDto) {
    return this.esimAdmin.listOps({ ...query, skip: 0, take: 1000, export: true });
  }

  @Get('payments')
  @Permissions('orders.read')
  payments(@Query() query: EsimOpsPaymentQueryDto) {
    return this.esimAdmin.listPayments(query);
  }

  @Get('attempts')
  @Permissions('orders.read')
  attempts(@Query() query: EsimOpsAttemptQueryDto) {
    return this.esimAdmin.listAttempts(query);
  }

  @Get('orders/:id')
  @Permissions('orders.read')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.esimAdmin.getOpsDetail(id, { canReveal: canAdminViewPin(user.role) });
  }

  @Post('orders/:id/reveal')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Permissions('orders.read')
  async reveal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    if (!canAdminViewPin(user.role)) {
      throw new ForbiddenException('LPA access denied');
    }
    const revealed = await this.esimAdmin.revealInstallSecret(id);
    await this.adminAudit.record(
      user.id,
      ADMIN_AUDIT_ACTIONS.ESIM_LPA_REVEALED,
      AuditTargetType.ORDER,
      id,
      {
        orderCode: revealed.orderCode,
        profileId: revealed.profileId,
        role: user.role,
        outcome: 'revealed',
      },
      extractClientIp(req) ?? undefined,
    );
    return {
      installSecret: revealed.installSecret,
      qrSvg: revealed.qrSvg,
      appleSetupUrl: revealed.appleSetupUrl,
    };
  }

  @Post('orders/:id/recover')
  @Permissions('orders.retry')
  recover(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orderService.retryFulfillment(user.id, id);
  }

  @Get('orders/:id/topups')
  @Permissions('orders.read')
  listTopups(@Param('id', ParseUUIDPipe) id: string) {
    return this.esimTopups.listForOrder(id);
  }

  @Post('orders/:id/topups')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @Permissions('orders.manage')
  async submitTopup(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { packageId?: string },
    @Req() req: Request,
  ) {
    const result = await this.esimTopups.submitForOrder(id, String(body?.packageId ?? ''));
    await this.adminAudit.record(
      user.id,
      ADMIN_AUDIT_ACTIONS.ADMIN_ESIM_TOPUP_SUBMITTED,
      AuditTargetType.ORDER,
      id,
      {
        packageId: result.packageId,
        iccidSuffix: result.iccid.slice(-6),
        providerOrderId: result.providerOrderId,
        status: result.status,
      },
      extractClientIp(req) ?? undefined,
    );
    return result;
  }
}
