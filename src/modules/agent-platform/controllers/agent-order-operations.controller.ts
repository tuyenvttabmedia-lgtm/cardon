import { Body, Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AgentPlatformService } from '../services/agent-platform.service';
import {
  AgentOrderOperationsService,
  OrderListQuery,
} from '../services/agent-order-operations.service';

@Controller('agents/me/orders')
@UseGuards(JwtAuthGuard)
export class AgentOrderOperationsController {
  constructor(
    private readonly ordersService: AgentOrderOperationsService,
    private readonly platformService: AgentPlatformService,
  ) {}

  @Get('statistics')
  statistics(@CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.getStatistics(user.id);
  }

  @Get('search')
  search(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') q?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.ordersService.searchOrders(user.id, q ?? '', skip ? Number(skip) : 0, take ? Number(take) : 25);
  }

  @Get('export')
  async export(
    @CurrentUser() user: AuthenticatedUser,
    @Query('format') format?: 'csv' | 'excel' | 'pdf' | 'json',
    @Query() query?: OrderListQuery,
  ) {
    const session = await this.platformService.getSession(user.id, user);
    return this.ordersService.exportOrders(
      user.id,
      session.platformRole,
      format ?? 'csv',
      query ?? {},
    );
  }

  @Get('export/:jobId')
  exportJob(@CurrentUser() user: AuthenticatedUser, @Param('jobId', ParseUUIDPipe) jobId: string) {
    return this.ordersService.getExportJob(user.id, jobId);
  }

  @Get('timeline')
  timeline(@CurrentUser() user: AuthenticatedUser, @Query('orderId', ParseUUIDPipe) orderId: string) {
    return this.ordersService.getTimeline(user.id, orderId);
  }

  @Get('webhooks')
  webhooks(
    @CurrentUser() user: AuthenticatedUser,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('orderId') orderId?: string,
  ) {
    return this.ordersService.listWebhooks(user.id, {
      skip: skip ? Number(skip) : 0,
      take: take ? Number(take) : 25,
      orderId,
    });
  }

  @Get('logs')
  logs(
    @CurrentUser() user: AuthenticatedUser,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('search') search?: string,
  ) {
    return this.ordersService.listActivityLogs(user.id, {
      skip: skip ? Number(skip) : 0,
      take: take ? Number(take) : 25,
      search,
    });
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: OrderListQuery) {
    return this.ordersService.listOrders(user.id, {
      ...query,
      skip: query.skip ? Number(query.skip) : 0,
      take: query.take ? Number(query.take) : 25,
    });
  }

  @Get(':id')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('reveal') reveal?: string,
  ) {
    void this.ordersService.logActivity(user.id, user.email, 'view_detail', { orderId: id });
    return this.ordersService.getOrder(user.id, id, reveal === 'true');
  }

  @Post(':id/retry')
  async retry(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    const session = await this.platformService.getSession(user.id, user);
    return this.ordersService.retryOrder(user.id, session.platformRole, id);
  }

  @Post('audit')
  async audit(
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: {
      action: 'view_detail' | 'filter' | 'export' | 'retry' | 'search' | 'timeline';
      metadata?: Record<string, unknown>;
    },
  ) {
    const session = await this.platformService.getSession(user.id, user);
    if (body.action === 'export') {
      this.ordersService.assertCanExport(session.platformRole);
    }
    if (body.action === 'retry' && session.platformRole === 'READONLY') {
      throw new ForbiddenException('Readonly role cannot retry orders');
    }
    this.ordersService.logActivity(user.id, user.email, body.action, body.metadata);
    return { ok: true };
  }
}
