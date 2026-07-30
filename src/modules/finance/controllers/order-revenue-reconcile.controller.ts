import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { RunOrderRevenueReconcileDto } from '../dto/finance.dto';
import { FINANCE_PERMISSIONS } from '../entities/finance.constants';
import { OrderRevenueReconcileService } from '../services/order-revenue-reconcile.service';

@Controller('admin/finance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OrderRevenueReconcileController {
  constructor(
    private readonly orderRevenueReconcileService: OrderRevenueReconcileService,
  ) {}

  @Post('reconcile/order-revenue')
  @Permissions(FINANCE_PERMISSIONS.MANAGE)
  run(@Body() dto: RunOrderRevenueReconcileDto) {
    if (dto.reportDate) {
      return this.orderRevenueReconcileService.runForDate(dto.reportDate);
    }
    return this.orderRevenueReconcileService.runForPreviousDay();
  }
}
