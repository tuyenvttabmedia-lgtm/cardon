import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { extractClientCountryCode } from '../../common/utils/request-client.util';
import { resolveRetailMarket } from '../product/entities/retail-market';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { EsimAccountService } from './esim-account.service';
import { EsimOrderService } from './esim-order.service';
import { EsimPublicCatalogService } from './esim-public-catalog.service';
import { EsimTopupService } from './esim-topup.service';

@Controller('esim')
export class EsimController {
  constructor(
    private readonly account: EsimAccountService,
    private readonly catalog: EsimPublicCatalogService,
    private readonly orders: EsimOrderService,
    private readonly topups: EsimTopupService,
  ) {}

  /** Public eSIM offers for storefront browse. Does not place an order. */
  @Get('offers')
  offers(@Query('locale') locale?: string) {
    return this.catalog.listStorefront(locale);
  }

  /** Server-side price. The browser cannot supply the FX rate or the charge amount. */
  @Get('quote')
  quote(@Query('variantId', ParseUUIDPipe) variantId: string, @Req() req: Request) {
    return this.orders.quote(variantId, resolveRetailMarket(extractClientCountryCode(req)));
  }

  @Get('profiles')
  @UseGuards(JwtAuthGuard)
  profiles(@CurrentUser() user: AuthenticatedUser) {
    return this.account.listForUser(user.id);
  }

  @Get('profiles/:orderId')
  @UseGuards(JwtAuthGuard)
  profile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.account.getForUser(user.id, orderId);
  }

  /** Airalo top-up packages available for this installed eSIM (sandbox/ops E2E). */
  @Get('profiles/:orderId/topups')
  @UseGuards(JwtAuthGuard)
  listTopups(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.topups.listForOrder(orderId, user.id);
  }

  /**
   * Submit Airalo partner-credit top-up for the caller's eSIM.
   * Customer-paid checkout can wrap this later; sandbox checklist uses partner balance.
   */
  @Post('profiles/:orderId/topups')
  @UseGuards(JwtAuthGuard)
  submitTopup(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() body: { packageId?: string },
  ) {
    return this.topups.submitForOrder(orderId, String(body?.packageId ?? ''), user.id);
  }
}
