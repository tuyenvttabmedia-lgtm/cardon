import {
  BadRequestException,
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
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AbuseRateLimitService } from '../../../common/abuse-rate-limit/abuse-rate-limit.service';
import { EmailPolicyService } from '../../../common/email-policy/email-policy.service';
import { TURNSTILE_ACTION_GUEST_ORDER } from '../../../common/turnstile/turnstile.constants';
import { TurnstileService } from '../../../common/turnstile/turnstile.service';
import {
  extractClientIp,
  extractClientUserAgent,
  extractClientCountryCode,
} from '../../../common/utils/request-client.util';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../auth/guards/optional-jwt-auth.guard';
import { PlatformMaintenanceGuard } from '../../maintenance-center/guards/platform-maintenance.guard';
import { MaintenanceModule } from '../../maintenance-center/decorators/maintenance-module.decorator';
import { CreateOrderDto } from '../dto/create-order.dto';
import { GuestOrderLookupDto } from '../dto/guest-order-lookup.dto';
import { RevealPinDto } from '../dto/reveal-pin.dto';
import { OrderDeliveryService } from '../services/order-delivery.service';
import { OrderService } from '../services/order.service';

@Controller('orders')
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    private readonly orderDeliveryService: OrderDeliveryService,
    private readonly turnstile: TurnstileService,
    private readonly abuseRateLimit: AbuseRateLimitService,
    private readonly emailPolicy: EmailPolicyService,
  ) {}

  @Post()
  @UseGuards(OptionalJwtAuthGuard, PlatformMaintenanceGuard)
  @MaintenanceModule('orders')
  async createOrder(
    @Body() dto: CreateOrderDto,
    @CurrentUser() user?: AuthenticatedUser,
    @Req() req?: Request,
  ) {
    const ip = req ? extractClientIp(req) : undefined;
    const isGuest = !user;

    if (isGuest) {
      await this.turnstile.verifyOrThrow({
        token: dto.captchaToken,
        remoteIp: ip,
        expectedAction: TURNSTILE_ACTION_GUEST_ORDER,
      });
      const guestEmail = dto.guestEmail?.trim();
      if (!guestEmail) {
        throw new BadRequestException('guestEmail is required for guest checkout');
      }
      this.emailPolicy.assertRegistrationEmailAllowed(guestEmail);
    }

    // Guest: IP + emailHash (shared NAT risk accepted for anonymous).
    // Authenticated: userId only — do not share guest IP counters (CGNAT / VN mobile).
    await this.abuseRateLimit.consumeFailOpen({
      bucket: 'order_create',
      ip: isGuest ? ip : undefined,
      userId: isGuest ? undefined : user?.id,
      email: isGuest ? dto.guestEmail : undefined,
    });

    return this.orderService.createOrder(
      dto,
      user,
      req
        ? {
            ip: extractClientIp(req),
            userAgent: extractClientUserAgent(req),
            countryCode: extractClientCountryCode(req),
          }
        : undefined,
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  listOrders(@CurrentUser() user: AuthenticatedUser) {
    return this.orderService.listCustomerOrders(user.id);
  }

  @Get('lookup/delivery')
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  lookupGuestDelivery(@Query() query: GuestOrderLookupDto) {
    return this.orderDeliveryService.lookupGuestDelivery(query.orderCode, query.email);
  }

  @Get('lookup/cards')
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  lookupGuestOrderCards(@Query() query: GuestOrderLookupDto) {
    return this.orderService.getGuestOrderCardsSummary(query.orderCode, query.email);
  }

  @Get('lookup')
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  lookupGuestOrder(@Query() query: GuestOrderLookupDto) {
    return this.orderDeliveryService.lookupGuestDelivery(query.orderCode, query.email);
  }

  @Get(':id/delivery')
  @UseGuards(OptionalJwtAuthGuard)
  getOrderDelivery(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('email') email: string | undefined,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    if (user) {
      return this.orderDeliveryService.getCustomerDelivery(id, user.id);
    }
    if (!email?.trim()) {
      return this.orderService.requireGuestEmailForDelivery();
    }
    return this.orderDeliveryService.revealGuestDeliveryById(id, email.trim());
  }

  @Post(':id/cards/:cardId/reveal-pin')
  @UseGuards(OptionalJwtAuthGuard)
  revealPin(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Body() dto: RevealPinDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.orderDeliveryService.revealPin(id, cardId, user, dto.email);
  }

  @Post(':id/esim/reveal')
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @UseGuards(OptionalJwtAuthGuard)
  revealEsim(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RevealPinDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.orderDeliveryService.revealEsimInstall(id, user, dto.email);
  }

  @Get(':id/cards')
  @UseGuards(JwtAuthGuard)
  getOrderCards(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.orderService.getCustomerOrderCardsSummary(id, user.id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  getOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.orderService.getCustomerOrder(id, user.id);
  }
}
