import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AdminAgentCenterTabQueryDto } from '../dto/admin-agent-center.dto';
import {
  AgentAdjustmentsQueryDto,
  AgentStatementExportQueryDto,
  AgentStatementOrdersQueryDto,
  AgentStatementPeriodQueryDto,
  AgentStatementReasonDto,
  CreateAgentStatementAdjustmentDto,
  GenerateAgentStatementDto,
  MarkStatementPaidDto,
  VoidAgentInvoiceDto,
} from '../dto/admin-agent-statement.dto';
import { AdminAgentStatementCenterService } from '../services/admin-agent-statement-center.service';

@Controller('admin/agent-center/agents/:agentId')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdminAgentStatementController {
  constructor(private readonly statementCenter: AdminAgentStatementCenterService) {}

  @Get('statement-center/dashboard')
  @Permissions('users.read', 'finance.view')
  dashboard(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Query() query: AgentStatementPeriodQueryDto,
  ) {
    return this.statementCenter.getDashboard(agentId, query);
  }

  @Get('statements')
  @Permissions('users.read', 'finance.view')
  listStatements(@Param('agentId', ParseUUIDPipe) agentId: string) {
    return this.statementCenter.listStatements(agentId);
  }

  @Get('statements/export')
  @Permissions('users.read', 'finance.view', 'finance.manage')
  exportStatement(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Query() query: AgentStatementExportQueryDto,
  ) {
    return this.statementCenter.exportStatement(agentId, query);
  }

  @Get('statements/:statementId')
  @Permissions('users.read', 'finance.view')
  getStatement(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Param('statementId', ParseUUIDPipe) statementId: string,
  ) {
    return this.statementCenter.getStatement(agentId, statementId);
  }

  @Get('statement-orders')
  @Permissions('users.read', 'finance.view')
  statementOrders(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Query() query: AgentStatementOrdersQueryDto,
  ) {
    return this.statementCenter.getStatementOrders(agentId, query);
  }

  @Post('statements/generate')
  @Permissions('users.read', 'finance.manage')
  generateStatement(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: GenerateAgentStatementDto,
  ) {
    return this.statementCenter.generateStatement(agentId, dto, admin);
  }

  @Post('statements/:statementId/lock')
  @Permissions('users.read', 'finance.manage')
  lockStatement(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Param('statementId', ParseUUIDPipe) statementId: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Body() body: AgentStatementReasonDto,
  ) {
    return this.statementCenter.lockStatement(agentId, statementId, admin, body.reason);
  }

  @Post('statements/:statementId/cancel')
  @Permissions('users.read', 'finance.manage')
  cancelStatement(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Param('statementId', ParseUUIDPipe) statementId: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Body() body: AgentStatementReasonDto,
  ) {
    return this.statementCenter.cancelDraftStatement(agentId, statementId, admin, body.reason);
  }

  @Post('statements/:statementId/unlock')
  @Permissions('users.read', 'finance.manage')
  unlockStatement(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Param('statementId', ParseUUIDPipe) statementId: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Body() body: AgentStatementReasonDto,
  ) {
    return this.statementCenter.unlockStatement(agentId, statementId, admin, body.reason);
  }

  @Post('statements/:statementId/mark-paid')
  @Permissions('users.read', 'finance.manage')
  markStatementPaid(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Param('statementId', ParseUUIDPipe) statementId: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Body() body: MarkStatementPaidDto,
  ) {
    return this.statementCenter.markStatementPaid(agentId, statementId, admin, body.note);
  }

  @Post('statements/:statementId/invoice')
  @Permissions('users.read', 'finance.manage')
  createInvoice(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Param('statementId', ParseUUIDPipe) statementId: string,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.statementCenter.createInvoiceFromStatement(agentId, statementId, admin);
  }

  @Get('adjustments')
  @Permissions('users.read', 'finance.view')
  listAdjustments(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Query() query: AgentAdjustmentsQueryDto,
  ) {
    return this.statementCenter.listAdjustments(agentId, query);
  }

  @Post('adjustments')
  @Permissions('users.read', 'finance.manage')
  createAdjustment(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: CreateAgentStatementAdjustmentDto,
  ) {
    return this.statementCenter.createAdjustment(agentId, dto, admin);
  }

  @Get('invoices')
  @Permissions('users.read', 'finance.view')
  listInvoices(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Query() query: AdminAgentCenterTabQueryDto,
  ) {
    return this.statementCenter.getInvoices(agentId, query);
  }

  @Get('invoices/:invoiceId')
  @Permissions('users.read', 'finance.view')
  getInvoice(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
  ) {
    return this.statementCenter.getInvoice(agentId, invoiceId);
  }

  @Get('invoices/:invoiceId/export')
  @Permissions('users.read', 'finance.view', 'finance.manage')
  exportInvoice(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Query('format') format?: 'csv' | 'html',
  ) {
    return this.statementCenter.exportInvoice(agentId, invoiceId, format ?? 'csv');
  }

  @Post('invoices/:invoiceId/issue')
  @Permissions('users.read', 'finance.manage')
  issueInvoice(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.statementCenter.issueAgentInvoice(agentId, invoiceId, admin);
  }

  @Post('invoices/:invoiceId/void')
  @Permissions('users.read', 'finance.manage')
  voidInvoice(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Body() body: VoidAgentInvoiceDto,
  ) {
    return this.statementCenter.voidAgentInvoice(agentId, invoiceId, admin, body.reason);
  }
}
