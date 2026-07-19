import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { IDEMPOTENCY_KEY_HEADER } from '../../payment/entities/payment.constants';
import { AgentPlatformService } from '../services/agent-platform.service';
import { AgentFinanceService, FinanceQuery } from '../services/agent-finance.service';
import { CreateAgentDepositDto } from '../../agent-deposit/dto/create-agent-deposit.dto';

@Controller('agents/me/finance')
@UseGuards(JwtAuthGuard)
export class AgentFinanceController {
  constructor(
    private readonly financeService: AgentFinanceService,
    private readonly platformService: AgentPlatformService,
  ) {}

  @Get('overview')
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.financeService.getOverview(user.id);
  }

  @Get('deposits')
  deposits(@CurrentUser() user: AuthenticatedUser, @Query() query: FinanceQuery) {
    return this.financeService.listDeposits(user.id, {
      skip: query.skip ? Number(query.skip) : 0,
      take: query.take ? Number(query.take) : 25,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
  }

  @Get('deposits/:id')
  depositDetail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.financeService.getDeposit(user.id, id, user.email);
  }

  @Post('deposits')
  async createDeposit(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAgentDepositDto,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey: string,
  ) {
    const session = await this.platformService.getSession(user.id, user);
    return this.financeService.createDeposit(
      user.id,
      user.email,
      dto.amount,
      idempotencyKey,
      dto.gateway,
      session.platformRole,
    );
  }

  @Post('deposits/:id/refresh')
  refreshDeposit(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.financeService.refreshDeposit(user.id, id, user.email);
  }

  @Get('withdraws')
  withdraws(@CurrentUser() user: AuthenticatedUser, @Query() query: FinanceQuery) {
    return this.financeService.listWithdraws(user.id, {
      skip: query.skip ? Number(query.skip) : 0,
      take: query.take ? Number(query.take) : 25,
    });
  }

  @Get('settlements')
  settlements(@CurrentUser() user: AuthenticatedUser, @Query() query: FinanceQuery) {
    return this.financeService.getSettlements(user.id, {
      skip: query.skip ? Number(query.skip) : 0,
      take: query.take ? Number(query.take) : 25,
    });
  }

  @Get('settlements/:id')
  settlementDetail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.financeService.getSettlement(user.id, id);
  }

  @Get('adjustments')
  adjustments(@CurrentUser() user: AuthenticatedUser, @Query() query: FinanceQuery) {
    return this.financeService.listAdjustments(user.id, {
      skip: query.skip ? Number(query.skip) : 0,
      take: query.take ? Number(query.take) : 25,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
  }

  @Get('credit')
  credit(@CurrentUser() user: AuthenticatedUser) {
    return this.financeService.getCredit(user.id);
  }

  @Get('history')
  history(@CurrentUser() user: AuthenticatedUser, @Query() query: FinanceQuery) {
    return this.financeService.listHistory(user.id, {
      skip: query.skip ? Number(query.skip) : 0,
      take: query.take ? Number(query.take) : 25,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      type: query.type,
      category: query.category,
      search: query.search,
    });
  }

  @Get('notifications')
  notifications(@CurrentUser() user: AuthenticatedUser) {
    return this.financeService.getNotifications(user.id);
  }

  @Post('audit')
  async audit(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { action: 'view_detail' | 'filter' | 'export_csv' | 'export_excel' | 'export_pdf'; metadata?: Record<string, unknown> },
  ) {
    const session = await this.platformService.getSession(user.id, user);
    if (body.action.startsWith('export')) {
      this.financeService.assertCanExport(session.platformRole);
    }
    this.financeService.logActivity(user.id, user.email, body.action, body.metadata);
    return { ok: true };
  }
}
