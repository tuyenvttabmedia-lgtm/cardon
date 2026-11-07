import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { EsimAccountService } from './esim-account.service';
import { EsimPublicCatalogService } from './esim-public-catalog.service';

@Controller('esim')
export class EsimController {
  constructor(
    private readonly account: EsimAccountService,
    private readonly catalog: EsimPublicCatalogService,
  ) {}

  /** Public eSIM offers for storefront browse. Does not place an order. */
  @Get('offers')
  offers() {
    return this.catalog.listStorefront();
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
}
