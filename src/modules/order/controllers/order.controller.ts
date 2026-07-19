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

import { Throttle } from '@nestjs/throttler';

import type { Request } from 'express';

import {

  extractClientIp,

  extractClientUserAgent,

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

  ) {}



  @Post()

  @UseGuards(OptionalJwtAuthGuard, PlatformMaintenanceGuard)

  @MaintenanceModule('orders')

  createOrder(

    @Body() dto: CreateOrderDto,

    @CurrentUser() user?: AuthenticatedUser,

    @Req() req?: Request,

  ) {

    return this.orderService.createOrder(

      dto,

      user,

      req

        ? { ip: extractClientIp(req), userAgent: extractClientUserAgent(req) }

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


