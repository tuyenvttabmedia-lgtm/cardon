import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PaypalFeeMatchStatus } from '@prisma/client';
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
  EsimFinanceRevenueQueryDto,
  PaypalFeeMatchListQueryDto,
  PaypalFeeMatchResolveDto,
  VatDailyQueryDto,
  VatRetailOutputQueryDto,
} from '../dto/finance.dto';
import { FINANCE_AUDIT_ACTIONS, FINANCE_PERMISSIONS } from '../entities/finance.constants';
import { assertExportCsvSafe } from '../entities/export-safety';
import { EsimAdminService } from '../../esim/esim-admin.service';
import { AgentStatementService } from '../services/agent-statement.service';
import { ExportService } from '../services/export.service';
import { FinanceAuditService } from '../services/finance-audit.service';
import { GatewayFeesService } from '../services/gateway-fees.service';
import { GatewayInvoiceService } from '../services/gateway-invoice.service';
import { InvoiceService } from '../services/invoice.service';
import { PaymentReconcileService } from '../services/payment-reconcile.service';
import { PaymentSettlementService } from '../services/payment-settlement.service';
import { PaypalFeeReconcileService } from '../services/paypal-fee-reconcile.service';
import { ProfitService } from '../services/profit.service';
import { ProviderReconcileService } from '../services/provider-reconcile.service';
import { ProviderOperationsService } from '../services/provider-operations.service';
import { ReconcileReportService } from '../services/reconcile-report.service';
import { VatDailyService } from '../services/vat-daily.service';

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
    private readonly vatDailyService: VatDailyService,
    private readonly esimAdminService: EsimAdminService,
    private readonly financeAuditService: FinanceAuditService,
    private readonly paypalFeeReconcileService: PaypalFeeReconcileService,
  ) {}

  @Get('vat/supplier')
  @Permissions(FINANCE_PERMISSIONS.VIEW)
  vatSupplier(@Query() query: VatDailyQueryDto) {
    return this.vatDailyService.getSupplierPack(query);
  }

  @Get('vat/retail-output')
  @Permissions(FINANCE_PERMISSIONS.VIEW)
  vatRetailOutput(@Query() query: VatRetailOutputQueryDto) {
    return this.vatDailyService.getRetailOutputPack(query);
  }

  @Get('vat/gateway-fee')
  @Permissions(FINANCE_PERMISSIONS.VIEW)
  vatGatewayFee(@Query() query: VatDailyQueryDto) {
    return this.vatDailyService.getGatewayFeePack(query);
  }

  @Get('vat/summary')
  @Permissions(FINANCE_PERMISSIONS.VIEW)
  vatSummary(@Query() query: VatDailyQueryDto) {
    return this.vatDailyService.getMonthlySummary(query);
  }

  @Get('esim/revenue')
  @Permissions(FINANCE_PERMISSIONS.VIEW)
  esimRevenue(@Query() query: EsimFinanceRevenueQueryDto) {
    return this.esimAdminService.getFinanceRevenue(toEsimFinanceQuery(query));
  }

  @Get('esim/revenue/export')
  @Permissions(FINANCE_PERMISSIONS.VIEW)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="esim-finance-revenue.csv"')
  async exportEsimRevenue(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: EsimFinanceRevenueQueryDto,
  ) {
    const mapped = toEsimFinanceQuery(query);
    const { csv, report } = await this.esimAdminService.exportFinanceRevenueCsv(mapped);
    assertExportCsvSafe(csv);
    await this.financeAuditService.recordEsimRevenueExported(user.id, {
      productLane: 'ESIM',
      dateFrom: mapped.from ?? null,
      dateTo: mapped.to ?? null,
      preset: mapped.preset ?? null,
      market: mapped.market ?? null,
      currency: mapped.currency ?? null,
      gateway: mapped.gateway ?? null,
      commercePayments: report.commerce.paymentCount,
      sandboxPayments: report.sandbox.paymentCount,
    });
    return csv;
  }

  @Post('esim/paypal/imports')
  @Permissions(FINANCE_PERMISSIONS.MANAGE)
  @UseInterceptors(FileInterceptor('file'))
  importPaypalActivityCsv(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('periodFrom') periodFrom?: string,
    @Body('periodTo') periodTo?: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('CSV file is required');
    }
    return this.paypalFeeReconcileService.importCsv({
      adminId: user.id,
      filename: file.originalname || 'paypal-activity.csv',
      buffer: file.buffer,
      periodFrom,
      periodTo,
    });
  }

  @Get('esim/paypal/imports')
  @Permissions(FINANCE_PERMISSIONS.VIEW)
  listPaypalImports() {
    return this.paypalFeeReconcileService.listImports();
  }

  @Get('esim/paypal/imports/:id')
  @Permissions(FINANCE_PERMISSIONS.VIEW)
  getPaypalImport(@Param('id', ParseUUIDPipe) id: string) {
    return this.paypalFeeReconcileService.getImport(id);
  }

  @Post('esim/paypal/imports/:id/match')
  @Permissions(FINANCE_PERMISSIONS.MANAGE)
  rematchPaypalImport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.paypalFeeReconcileService.runMatch(user.id, id);
  }

  @Get('esim/paypal/matches')
  @Permissions(FINANCE_PERMISSIONS.VIEW)
  listPaypalMatches(@Query() query: PaypalFeeMatchListQueryDto) {
    return this.paypalFeeReconcileService.listMatches({
      importId: query.importId,
      status: query.status as PaypalFeeMatchStatus | undefined,
      take: query.take,
    });
  }

  @Post('esim/paypal/matches/:id/resolve')
  @Permissions(FINANCE_PERMISSIONS.MANAGE)
  resolvePaypalMatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PaypalFeeMatchResolveDto,
  ) {
    return this.paypalFeeReconcileService.resolveManual({
      adminId: user.id,
      matchId: id,
      paymentId: dto.paymentId,
      note: dto.note,
    });
  }

  @Get('esim/paypal/export')
  @Permissions(FINANCE_PERMISSIONS.VIEW)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="esim-paypal-fee-recon.csv"')
  async exportPaypalMatches(
    @CurrentUser() user: AuthenticatedUser,
    @Query('importId') importId?: string,
  ) {
    const csv = await this.paypalFeeReconcileService.exportMatchesCsv(importId);
    assertExportCsvSafe(csv);
    await this.financeAuditService.recordPaypalEvent(
      user.id,
      FINANCE_AUDIT_ACTIONS.ESIM_PAYPAL_RECON_EXPORTED,
      importId ?? user.id,
      { importId: importId ?? null },
    );
    return csv;
  }

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

function toEsimFinanceQuery(query: EsimFinanceRevenueQueryDto) {
  return {
    from: query.dateFrom,
    to: query.dateTo,
    preset: query.preset,
    market: query.market,
    currency: query.currency,
    gateway: query.gateway,
  };
}
