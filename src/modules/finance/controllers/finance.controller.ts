import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import {
  AgentStatementQueryDto,
  CreateAgentInvoiceDto,
  CreateCustomerInvoiceDto,
  FinanceListQueryDto,
  GatewayFeesQueryDto,
  PaymentReconcileDto,
  PaymentSettlementQueryDto,
  ProfitQueryDto,
  ProviderReconcileDto,
  UpsertGatewayInvoiceDto,
  VoidInvoiceDto,
  ProviderFinanceDashboardQueryDto,
  ProviderReconciliationQueryDto,
  ProviderTransactionSearchQueryDto,
  RunProviderReconciliationDto,
} from '../dto/finance.dto';
import { FINANCE_PERMISSIONS } from '../entities/finance.constants';
import { AgentStatementService } from '../services/agent-statement.service';
import { ExportService } from '../services/export.service';
import { GatewayFeesService } from '../services/gateway-fees.service';
import { GatewayInvoiceService } from '../services/gateway-invoice.service';
import { InvoiceService } from '../services/invoice.service';
import { PaymentReconcileService } from '../services/payment-reconcile.service';
import { PaymentSettlementService } from '../services/payment-settlement.service';
import { ProfitService } from '../services/profit.service';
import { ProviderReconcileService } from '../services/provider-reconcile.service';
import { ProviderOperationsService } from '../services/provider-operations.service';
import { ReconcileReportService } from '../services/reconcile-report.service';

@Controller('admin/finance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FinanceController {
  constructor(
    private readonly paymentReconcileService: PaymentReconcileService,
    private readonly providerReconcileService: ProviderReconcileService,
    private readonly providerOperationsService: ProviderOperationsService,
    private readonly reconcileReportService: ReconcileReportService,
    private readonly profitService: ProfitService,
    private readonly gatewayFeesService: GatewayFeesService,
    private readonly paymentSettlementService: PaymentSettlementService,
    private readonly gatewayInvoiceService: GatewayInvoiceService,
    private readonly agentStatementService: AgentStatementService,
    private readonly invoiceService: InvoiceService,
    private readonly exportService: ExportService,
  ) {}

  @Post('reconcile/payment')
  @Permissions(FINANCE_PERMISSIONS.MANAGE)
  reconcilePayment(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PaymentReconcileDto,
  ) {
    return this.paymentReconcileService.reconcile(user.id, dto);
  }

  @Post('reconcile/provider')
  @Permissions(FINANCE_PERMISSIONS.MANAGE)
  reconcileProvider(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ProviderReconcileDto,
  ) {
    return this.providerReconcileService.reconcile(user.id, dto);
  }

  @Get('providers/reconciliation')
  @Permissions(FINANCE_PERMISSIONS.VIEW)
  listProviderReconciliation(@Query() query: ProviderReconciliationQueryDto) {
    return this.providerOperationsService.listReconciliationReports(query);
  }

  @Post('providers/reconciliation/run')
  @Permissions(FINANCE_PERMISSIONS.MANAGE)
  runProviderReconciliation(@Body() dto: RunProviderReconciliationDto) {
    return this.providerOperationsService.runDailyReconciliation(
      dto.providerId,
      dto.reportDate,
    );
  }

  @Get('providers/transactions')
  @Permissions(FINANCE_PERMISSIONS.VIEW)
  searchProviderTransactions(@Query() query: ProviderTransactionSearchQueryDto) {
    return this.providerOperationsService.searchTransactions(query);
  }

  @Get('providers/dashboard')
  @Permissions(FINANCE_PERMISSIONS.VIEW)
  getProviderFinanceDashboard(@Query() query: ProviderFinanceDashboardQueryDto) {
    return this.providerOperationsService.getFinanceDashboard(query);
  }

  @Get('export/providers/transactions')
  @Permissions(FINANCE_PERMISSIONS.MANAGE)
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="provider-transactions.csv"')
  exportProviderTransactions(@Query() query: ProviderTransactionSearchQueryDto) {
    return this.exportService.exportProviderTransactionsCsv(query);
  }

  @Get('reconcile/reports')
  @Permissions(FINANCE_PERMISSIONS.VIEW)
  listReconcileReports(@Query() query: FinanceListQueryDto) {
    return this.reconcileReportService.listReports(query);
  }

  @Get('reconcile/reports/:id')
  @Permissions(FINANCE_PERMISSIONS.VIEW)
  getReconcileReport(@Param('id', ParseUUIDPipe) id: string) {
    return this.reconcileReportService.getReport(id);
  }

  @Get('profit')
  @Permissions(FINANCE_PERMISSIONS.VIEW)
  getProfit(@Query() query: ProfitQueryDto) {
    return this.profitService.calculate(query);
  }

  @Get('gateway-fees')
  @Permissions(FINANCE_PERMISSIONS.VIEW)
  getGatewayFees(@Query() query: GatewayFeesQueryDto) {
    return this.gatewayFeesService.report(query);
  }

  @Get('payment-settlement')
  @Permissions(FINANCE_PERMISSIONS.VIEW)
  getPaymentSettlement(@Query() query: PaymentSettlementQueryDto) {
    return this.paymentSettlementService.report(query);
  }

  @Get('gateway-invoices')
  @Permissions(FINANCE_PERMISSIONS.VIEW)
  listGatewayInvoices(@Query() query: FinanceListQueryDto) {
    return this.gatewayInvoiceService.list(query.skip ?? 0, query.take ?? 50);
  }

  @Get('gateway-invoices/:id')
  @Permissions(FINANCE_PERMISSIONS.VIEW)
  getGatewayInvoice(@Param('id', ParseUUIDPipe) id: string) {
    return this.gatewayInvoiceService.get(id);
  }

  @Post('gateway-invoices')
  @Permissions(FINANCE_PERMISSIONS.MANAGE)
  upsertGatewayInvoice(@Body() dto: UpsertGatewayInvoiceDto) {
    return this.gatewayInvoiceService.upsert(dto);
  }

  @Get('agents/:agentId/statement')
  @Permissions(FINANCE_PERMISSIONS.VIEW)
  getAgentStatement(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Query() query: AgentStatementQueryDto,
  ) {
    return this.agentStatementService.generate(agentId, query);
  }

  @Get('invoices')
  @Permissions(FINANCE_PERMISSIONS.VIEW)
  listInvoices(@Query() query: FinanceListQueryDto) {
    return this.invoiceService.listInvoices(query);
  }

  @Get('invoices/:id')
  @Permissions(FINANCE_PERMISSIONS.VIEW)
  getInvoice(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoiceService.getInvoice(id);
  }

  @Post('invoices/customer')
  @Permissions(FINANCE_PERMISSIONS.MANAGE)
  createCustomerInvoice(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCustomerInvoiceDto,
  ) {
    return this.invoiceService.createCustomerInvoice(user.id, dto);
  }

  @Post('invoices/agent')
  @Permissions(FINANCE_PERMISSIONS.MANAGE)
  createAgentInvoice(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAgentInvoiceDto,
  ) {
    return this.invoiceService.createAgentInvoice(user.id, dto);
  }

  @Post('invoices/:id/issue')
  @Permissions(FINANCE_PERMISSIONS.MANAGE)
  issueInvoice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.invoiceService.issueInvoice(user.id, id);
  }

  @Post('invoices/:id/void')
  @Permissions(FINANCE_PERMISSIONS.MANAGE)
  voidInvoice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidInvoiceDto,
  ) {
    return this.invoiceService.voidInvoice(user.id, id, dto);
  }

  @Get('export/reconciliation/:reportId')
  @Permissions(FINANCE_PERMISSIONS.MANAGE)
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="reconciliation.csv"')
  exportReconciliation(@Param('reportId', ParseUUIDPipe) reportId: string) {
    return this.exportService.exportReconciliationCsv(reportId);
  }

  @Get('export/profit')
  @Permissions(FINANCE_PERMISSIONS.MANAGE)
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="profit.csv"')
  exportProfit(@Query() query: ProfitQueryDto) {
    return this.exportService.exportProfitCsv(query);
  }

  @Get('export/payments-reconciliation')
  @Permissions(FINANCE_PERMISSIONS.MANAGE)
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="payments-reconciliation.csv"')
  exportPaymentsReconciliation(@Query() query: GatewayFeesQueryDto) {
    return this.exportService.exportPaymentsReconciliationCsv(query);
  }

  @Get('export/agents/:agentId/statement')
  @Permissions(FINANCE_PERMISSIONS.MANAGE)
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="agent-statement.csv"')
  exportAgentStatement(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Query() query: AgentStatementQueryDto,
  ) {
    return this.exportService.exportAgentStatementCsv(agentId, query);
  }
}
