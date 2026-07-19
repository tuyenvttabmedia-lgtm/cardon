import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { activityContextFromRequest } from '../../activity-log/utils/activity-context.util';
import {
  ManualOperationAction,
  OPERATIONS_PERMISSIONS,
} from '../entities/operations-center.constants';
import { OperationsCenterService, OperationsListQuery, OperationsExceptionState } from '../services/operations-center.service';
import { OperationsManualService } from '../services/operations-manual.service';

@Controller('admin/operations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OperationsCenterController {
  constructor(
    private readonly operationsService: OperationsCenterService,
    private readonly manualService: OperationsManualService,
  ) {}

  @Get('dashboard')
  @Permissions(OPERATIONS_PERMISSIONS.RECONCILIATION_READ, 'finance.view', 'admin.dashboard')
  dashboard() {
    return this.operationsService.getDashboard();
  }

  @Get('reconciliation/summary')
  @Permissions(OPERATIONS_PERMISSIONS.RECONCILIATION_READ, 'finance.view')
  reconciliationSummary() {
    return this.operationsService.getReconciliationSummary();
  }

  @Get('reconciliation')
  @Permissions(OPERATIONS_PERMISSIONS.RECONCILIATION_READ, 'finance.view')
  listReconciliation(@Query() query: OperationsListQuery) {
    return this.operationsService.listReconciliation({
      ...query,
      skip: query.skip ? Number(query.skip) : 0,
      take: query.take ? Number(query.take) : 50,
    });
  }

  @Get('exceptions')
  @Permissions(OPERATIONS_PERMISSIONS.RECONCILIATION_READ, 'finance.view')
  listExceptions(@Query() query: OperationsListQuery) {
    return this.operationsService.listExceptions({
      ...query,
      skip: query.skip ? Number(query.skip) : 0,
      take: query.take ? Number(query.take) : 25,
    });
  }

  @Patch('exceptions/:id')
  @Permissions(OPERATIONS_PERMISSIONS.RECONCILIATION_MANAGE, 'finance.manage')
  updateException(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { status?: string; assignedTo?: string; note?: string },
  ): OperationsExceptionState {
    return this.operationsService.updateException(id, {
      status: body.status as never,
      assignedTo: body.assignedTo ?? user.id,
      assignedEmail: user.email,
      note: body.note,
      performedBy: user.id,
      performedEmail: user.email,
    });
  }

  @Get('search')
  @Permissions(OPERATIONS_PERMISSIONS.RECONCILIATION_READ, 'orders.read', 'finance.view')
  search(@Query('q') q?: string) {
    return this.operationsService.globalSearch(q ?? '');
  }

  @Get('invoices')
  @Permissions(OPERATIONS_PERMISSIONS.INVOICE_READ, 'invoice.manage', 'finance.view')
  listInvoices(@Query('skip') skip?: string, @Query('take') take?: string) {
    return this.operationsService.listInvoices(skip ? Number(skip) : 0, take ? Number(take) : 25);
  }

  @Get('invoices/:id')
  @Permissions(OPERATIONS_PERMISSIONS.INVOICE_READ, 'invoice.manage', 'finance.view')
  getInvoice(@Param('id', ParseUUIDPipe) id: string) {
    return this.operationsService.getInvoice(id);
  }

  @Post('manual/:action')
  @Permissions(OPERATIONS_PERMISSIONS.OPERATIONS_MANAGE, 'orders.retry', 'finance.manage')
  manualAction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('action') action: ManualOperationAction,
    @Body() body: { orderId?: string; webhookId?: string; note?: string },
    @Req() req: Request,
  ) {
    const ctx = activityContextFromRequest(req);
    return this.manualService.execute(user, action, {
      ...body,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  }

  @Post('audit')
  @Permissions(OPERATIONS_PERMISSIONS.RECONCILIATION_READ)
  audit(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { action: string; metadata?: Record<string, unknown> },
  ) {
    this.operationsService.logActivity(user.id, user.email, body.action, body.metadata);
    return { ok: true };
  }
}
