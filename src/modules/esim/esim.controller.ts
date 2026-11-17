import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { Request } from 'express';
import { extractClientCountryCode } from '../../common/utils/request-client.util';
import { resolveRetailMarket } from '../product/entities/retail-market';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { EsimAccountService } from './esim-account.service';
import { EsimOrderService } from './esim-order.service';
import { EsimPublicCatalogService } from './esim-public-catalog.service';
import { EsimTopupCheckoutService } from './esim-topup-checkout.service';
import { EsimTopupService } from './esim-topup.service';
import { maskEsimIccid } from './esim-usage.rules';

class EsimTopupCheckoutDto {
  @IsString()
  @MinLength(1)
  packageId!: string;

  @IsString()
  @MinLength(1)
  paymentMethodCode!: string;
}

@Controller('esim')
export class EsimController {
  constructor(
    private readonly account: EsimAccountService,
    private readonly catalog: EsimPublicCatalogService,
    private readonly orders: EsimOrderService,
    private readonly topups: EsimTopupService,
    private readonly topupCheckout: EsimTopupCheckoutService,
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

  /** Live usage from Airalo (cached ~20m upstream; rate-limited). */
  @Get('profiles/:orderId/usage')
  @UseGuards(JwtAuthGuard)
  async usage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    const result = await this.topups.usageForOrder(orderId, user.id);
    return {
      iccidMasked: maskEsimIccid(result.iccid),
      usage: result.usage,
    };
  }

  /** Top-up packages for this eSIM, priced with CardOn sell rules. */
  @Get('profiles/:orderId/topups')
  @UseGuards(JwtAuthGuard)
  async listTopups(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    const result = await this.topups.listForOrder(orderId, user.id);
    return {
      iccidMasked: maskEsimIccid(result.iccid),
      packages: result.packages.map((pack) => ({
        providerPackageId: pack.providerPackageId,
        title: pack.title,
        dataLabel: pack.dataLabel,
        validityLabel: pack.validityLabel,
        sellPriceVnd: pack.sellPriceVnd,
        dataAmountMb: pack.dataAmountMb,
        validityDays: pack.validityDays,
      })),
    };
  }

  /** Create a paid top-up order (VN). Client then creates payment like normal eSIM. */
  @Post('profiles/:orderId/topups')
  @UseGuards(JwtAuthGuard)
  submitTopup(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: EsimTopupCheckoutDto,
  ) {
    return this.topupCheckout.createCheckout(user, orderId, dto.packageId, dto.paymentMethodCode);
  }
}
