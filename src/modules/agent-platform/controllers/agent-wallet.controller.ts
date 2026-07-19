import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AgentPlatformService } from '../services/agent-platform.service';
import { AgentWalletService, WalletLedgerQuery } from '../services/agent-wallet.service';

@Controller('agents/me/wallet')
@UseGuards(JwtAuthGuard)
export class AgentWalletController {
  constructor(
    private readonly walletService: AgentWalletService,
    private readonly platformService: AgentPlatformService,
  ) {}

  @Get()
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.walletService.getOverview(user.id);
  }

  @Get('summary')
  summary(
    @CurrentUser() user: AuthenticatedUser,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.walletService.getSummary(user.id, dateFrom, dateTo);
  }

  @Get('ledger')
  ledger(@CurrentUser() user: AuthenticatedUser, @Query() query: WalletLedgerQuery) {
    return this.walletService.listLedger(user.id, {
      skip: query.skip ? Number(query.skip) : 0,
      take: query.take ? Number(query.take) : 25,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      type: query.type,
      status: query.status,
      orderId: query.orderId,
      reference: query.reference,
      amountMin: query.amountMin,
      amountMax: query.amountMax,
      search: query.search,
    });
  }

  @Get('ledger/:id')
  ledgerDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.walletService.getLedgerDetail(user.id, id);
  }

  @Get('deposits')
  deposits(@CurrentUser() user: AuthenticatedUser, @Query() query: WalletLedgerQuery) {
    return this.walletService.listDeposits(user.id, {
      skip: query.skip ? Number(query.skip) : 0,
      take: query.take ? Number(query.take) : 25,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
  }

  @Get('withdraws')
  withdraws(@CurrentUser() user: AuthenticatedUser, @Query() query: WalletLedgerQuery) {
    return this.walletService.listWithdraws(user.id, query);
  }

  @Get('limits')
  limits(@CurrentUser() user: AuthenticatedUser) {
    return this.walletService.getLimits(user.id);
  }

  @Get('activity')
  activity(@CurrentUser() user: AuthenticatedUser) {
    return this.walletService.getRecentActivity(user.id);
  }

  @Post('audit')
  async audit(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { action: 'view_detail' | 'filter' | 'export_csv' | 'export_excel' | 'export_pdf'; metadata?: Record<string, unknown> },
  ) {
    const session = await this.platformService.getSession(user.id, user);
    if (body.action.startsWith('export')) {
      this.walletService.assertCanExport(session.platformRole);
    }
    this.walletService.logActivity(user.id, user.email, body.action, body.metadata);
    return { ok: true };
  }
}
