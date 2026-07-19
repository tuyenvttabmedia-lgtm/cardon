import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AgentPlatformService } from '../services/agent-platform.service';

@Controller('agents/me/platform')
@UseGuards(JwtAuthGuard)
export class AgentPlatformController {
  constructor(private readonly platformService: AgentPlatformService) {}

  @Get('session')
  session(@CurrentUser() user: AuthenticatedUser) {
    return this.platformService.getSession(user.id, user);
  }

  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.platformService.getDashboard(user.id);
  }

  @Get('wallet')
  wallet(@CurrentUser() user: AuthenticatedUser) {
    return this.platformService.getWallet(user.id);
  }

  @Get('orders')
  orders(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.platformService.listOrders(user.id, {
      status,
      skip: skip ? Number(skip) : 0,
      take: take ? Number(take) : 20,
    });
  }

  @Get('products')
  products(@CurrentUser() user: AuthenticatedUser) {
    return this.platformService.listProducts(user.id);
  }

  @Get('settlement')
  settlement(@CurrentUser() user: AuthenticatedUser) {
    return this.platformService.getSettlement(user.id);
  }

  @Get('reports')
  reports(@CurrentUser() user: AuthenticatedUser) {
    return this.platformService.getReports(user.id);
  }

  @Get('api')
  api(@CurrentUser() user: AuthenticatedUser) {
    return this.platformService.getApiCenter(user.id);
  }

  @Get('webhooks')
  webhooks(@CurrentUser() user: AuthenticatedUser) {
    return this.platformService.getWebhooks(user.id);
  }

  @Get('invoices')
  invoices(@CurrentUser() user: AuthenticatedUser) {
    return this.platformService.listInvoices(user.id);
  }

  @Get('users')
  users(@CurrentUser() user: AuthenticatedUser) {
    return this.platformService.getUsers(user.id);
  }

  @Get('notifications')
  notifications(@CurrentUser() user: AuthenticatedUser) {
    return this.platformService.listNotifications(user.id);
  }
}
