import {
  BadRequestException,
  ForbiddenException,
  ConflictException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FulfillmentStatus, OrderPaymentStatus, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { ErrorCode } from '../../../common/constants/error-codes.constants';
import { AppHttpException } from '../../../common/exceptions/app-http.exception';
import { PrismaService } from '../../../database/prisma.service';
import { CardEncryptionService } from '../../provider/services/card-encryption.service';
import { PricingService } from '../../product/services/pricing.service';
import { ProviderMappingRepository } from '../../product/repositories/provider-mapping.repository';
import { VariantRepository } from '../../product/repositories/variant.repository';
import { SettingsStoreService } from '../../settings/services/settings-store.service';
import { calculateCustomerPaid, calculateProfit } from '../../payment/entities/payment-fee.engine';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AdminOrderQueryDto } from '../dto/admin-order-query.dto';
import { CreateOrderDto } from '../dto/create-order.dto';
import { UpdateOrderNoteDto } from '../dto/update-order.dto';
import {
  DEFAULT_PAYMENT_TIMEOUT_MINUTES,
} from '../entities/order.constants';
import {
  generateOrderCode,
  generateTransactionId,
} from '../entities/order-code.generator';
import { mapOrder } from '../entities/order.mapper';
import { assertCanModifyOrderMetadata, assertCanMarkPaid, assertPaymentTransition } from '../entities/order-state.machine';
import { OrderRepository } from '../repositories/order.repository';
import { OrderAuditService } from './order-audit.service';

function buildClientTrace(
  dto: CreateOrderDto,
  user: AuthenticatedUser | undefined,
  requestMeta?: { ip?: string | null; userAgent?: string | null },
): Prisma.InputJsonValue {
  return {
    customerId: user?.id ?? null,
    customerEmail: user?.email ?? dto.guestEmail ?? null,
    phone: dto.guestPhone ?? null,
    ipAddress: requestMeta?.ip ?? null,
    userAgent: requestMeta?.userAgent ?? null,
    deviceInfo: (dto.clientDeviceInfo ?? null) as Prisma.InputJsonValue,
    capturedAt: new Date().toISOString(),
  };
}

interface ResolvedLineItem {
  variantId: string;
  quantity: number;
  unitPrice: Decimal;
  faceValue: Decimal;
  lineDiscount: Decimal;
  lineTotal: Decimal;
  lineProviderCost: Decimal;
}

@Injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orderRepository: OrderRepository,
    private readonly variantRepository: VariantRepository,
    private readonly pricingService: PricingService,
    private readonly mappingRepository: ProviderMappingRepository,
    private readonly settingsStore: SettingsStoreService,
    private readonly orderAuditService: OrderAuditService,
    private readonly cardEncryption: CardEncryptionService,
  ) {}

  async createOrder(
    dto: CreateOrderDto,
    user?: AuthenticatedUser,
    requestMeta?: { ip?: string | null; userAgent?: string | null },
  ) {
    const isGuest = !user;
    if (isGuest && !dto.guestEmail) {
      throw new BadRequestException('guestEmail is required for guest checkout');
    }

    if (dto.invoiceRequired) {
      if (!dto.companyName || !dto.taxCode || !dto.address) {
        throw new BadRequestException(
          'companyName, taxCode, and address are required when invoiceRequired is true',
        );
      }
    }

    const lineItems = await this.resolveLineItems(dto);
    const sellAmount = lineItems.reduce(
      (sum, item) => sum.add(item.lineTotal),
      new Decimal(0),
    );
    const faceValue = lineItems.reduce(
      (sum, item) => sum.add(item.faceValue.mul(item.quantity)),
      new Decimal(0),
    );
    const discountAmount = lineItems.reduce(
      (sum, item) => sum.add(item.lineDiscount),
      new Decimal(0),
    );
    const providerCost = lineItems.reduce(
      (sum, item) => sum.add(item.lineProviderCost),
      new Decimal(0),
    );

    const paymentMethod = this.resolvePaymentMethod(dto.paymentMethodCode);
    const sellAmountNumber = Number(sellAmount.toFixed(0));
    const feeResult = calculateCustomerPaid(
      sellAmountNumber,
      paymentMethod.percentageFee,
      paymentMethod.fixedFee,
    );
    const paymentFeeAmount = new Decimal(feeResult.paymentFee);
    const customerPaid = new Decimal(feeResult.totalPayment);
    const profit = new Decimal(
      calculateProfit(feeResult.totalPayment, feeResult.paymentFee, Number(providerCost.toFixed(0))),
    );

    const orderLimits = this.settingsStore.resolveOrderConfig();
    const maxAmount = isGuest
      ? orderLimits.guestMaxOrderAmount ?? 0
      : orderLimits.customerMaxOrderAmount ?? 0;
    if (maxAmount > 0 && Number(customerPaid) > maxAmount) {
      throw new AppHttpException(
        ErrorCode.ORDER_AMOUNT_LIMIT,
        'Đơn hàng vượt quá giới hạn.',
        HttpStatus.BAD_REQUEST,
        { limit: maxAmount, current: Number(customerPaid) },
      );
    }

    const paymentTimeoutMinutes = await this.getPaymentTimeoutMinutes();
    const paymentExpiresAt = new Date(
      Date.now() + paymentTimeoutMinutes * 60_000,
    );

    const orderCode = generateOrderCode();
    const txnCode = generateTransactionId();

    const invoiceMetadata = dto.invoiceRequired
      ? {
          companyName: dto.companyName,
          taxCode: dto.taxCode,
          address: dto.address,
        }
      : {};

    const order = await this.prisma.$transaction(async (tx) => {
      const financialTransaction =
        await this.orderRepository.createFinancialTransaction(tx, {
          transactionId: txnCode,
          amount: customerPaid,
        });

      const created = await this.orderRepository.createWithTransaction(tx, {
        orderCode,
        transactionId: financialTransaction.id,
        userId: user?.id,
        guestEmail: isGuest ? dto.guestEmail : user?.email,
        guestPhone: dto.guestPhone,
        isGuestOrder: isGuest,
        invoiceRequired: dto.invoiceRequired ?? false,
        invoiceMetadata,
        customerNote: dto.customerNote,
        clientTrace: buildClientTrace(dto, user, requestMeta),
        totalAmount: customerPaid,
        faceValue,
        sellAmount,
        discountAmount,
        paymentMethodCode: paymentMethod.methodCode,
        methodDisplayName: paymentMethod.displayName,
        paymentGateway: paymentMethod.gatewayCode,
        settlementType: paymentMethod.settlementType,
        paymentFeePercent: new Decimal(paymentMethod.percentageFee),
        paymentFeeFixed: new Decimal(paymentMethod.fixedFee),
        paymentFeeAmount,
        customerPaid,
        providerCost,
        profit,
        paymentExpiresAt,
      });

      for (const item of lineItems) {
        await this.orderRepository.createOrderItem(tx, {
          orderId: created.id,
          variantId: item.variantId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.lineDiscount,
          totalAmount: item.lineTotal,
        });
      }

      return tx.order.findFirst({
        where: { id: created.id },
        include: {
          orderItems: {
            include: {
              variant: { select: { sku: true, name: true } },
            },
          },
        },
      });
    });

    if (!order) {
      throw new ConflictException('Order creation failed');
    }

    await this.orderAuditService.recordOrderCreated({
      orderId: order.id,
      actorUserId: user?.id,
      metadata: {
        orderCode: order.orderCode,
        isGuestOrder: order.isGuestOrder,
        totalAmount: customerPaid.toFixed(2),
        paymentMethodCode: paymentMethod.methodCode,
        customerPaid: customerPaid.toFixed(2),
      },
    });

    return mapOrder(order);
  }

  listCustomerOrders(userId: string) {
    return this.orderRepository
      .findManyByUserId(userId)
      .then((orders) => orders.map(mapOrder));
  }

  async getCustomerOrder(orderId: string, userId: string) {
    const order = await this.orderRepository.findByIdForUser(orderId, userId);
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return mapOrder(order);
  }

  async lookupGuestOrder(orderCode: string, email: string) {
    const order = await this.orderRepository.findByCodeForGuest(
      orderCode,
      email.trim(),
    );
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return mapOrder(order);
  }

  async getGuestOrderCards(orderCode: string, email: string) {
    return this.getGuestOrderCardsSummary(orderCode, email);
  }

  async getCustomerOrderCards(orderId: string, userId: string) {
    return this.getCustomerOrderCardsSummary(orderId, userId);
  }

  requireGuestEmailForDelivery(): never {
    throw new BadRequestException('email is required for guest order delivery lookup');
  }

  async getGuestOrderCardsSummary(orderCode: string, email: string) {
    const order = await this.orderRepository.findByCodeForGuestWithCards(
      orderCode,
      email.trim(),
    );
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return this.buildMaskedCardsResponse(order);
  }

  async getCustomerOrderCardsSummary(orderId: string, userId: string) {
    const order = await this.orderRepository.findByIdForUserWithCards(
      orderId,
      userId,
    );
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return this.buildMaskedCardsResponse(order);
  }

  private buildMaskedCardsResponse(order: {
    orderCode: string;
    paymentStatus: OrderPaymentStatus;
    fulfillmentStatus: FulfillmentStatus;
    orderItems: Array<{
      cardRecords: Array<{
        id: string;
        encryptedSerial: string;
        pinViewCount: number;
        pinFirstViewedAt: Date | null;
      }>;
    }>;
  }) {
    if (
      order.paymentStatus !== OrderPaymentStatus.PAID ||
      order.fulfillmentStatus !== FulfillmentStatus.COMPLETED
    ) {
      throw new ForbiddenException('Cards are not available for this order yet');
    }

    const cards: Array<{
      id: string;
      serial: string;
      pinMasked: string;
      pinViewCount: number;
      pinFirstViewedAt: string | null;
    }> = [];
    for (const item of order.orderItems) {
      for (const card of item.cardRecords) {
        cards.push({
          id: card.id,
          serial: this.cardEncryption.decrypt(card.encryptedSerial),
          pinMasked: '************',
          pinViewCount: card.pinViewCount,
          pinFirstViewedAt: card.pinFirstViewedAt?.toISOString() ?? null,
        });
      }
    }

    return {
      orderCode: order.orderCode,
      cards,
    };
  }

  listAdminOrders(query: AdminOrderQueryDto) {
    return this.orderRepository
      .findManyAdmin({
        paymentStatus: query.paymentStatus,
        fulfillmentStatus: query.fulfillmentStatus,
        dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
        dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
        skip: query.skip,
        take: query.take,
      })
      .then((orders) => orders.map(mapOrder));
  }

  async getAdminOrder(orderId: string) {
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return mapOrder(order);
  }

  async updateCustomerNote(orderId: string, dto: UpdateOrderNoteDto) {
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    assertCanModifyOrderMetadata({
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
    });

    const updated = await this.orderRepository.updateCustomerNote(
      orderId,
      dto.customerNote ?? null,
    );

    return mapOrder(updated);
  }

  async markPaid(orderId: string, paymentId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.markPaidInTransaction(tx, orderId, paymentId);
    });
  }

  async markPaidInTransaction(
    tx: import('@prisma/client').Prisma.TransactionClient,
    orderId: string,
    paymentId: string,
  ): Promise<void> {
    const order = await tx.order.findFirst({
      where: { id: orderId, deletedAt: null },
      select: {
        paymentStatus: true,
        paymentExpiresAt: true,
      },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    assertCanMarkPaid({
      paymentStatus: order.paymentStatus,
      paymentExpiresAt: order.paymentExpiresAt,
    });
    assertPaymentTransition(order.paymentStatus, OrderPaymentStatus.PAID);

    await this.orderRepository.updatePaymentStatus(
      orderId,
      OrderPaymentStatus.PAID,
      tx,
    );
    await this.orderRepository.linkActivePayment(orderId, paymentId, tx);
  }

  /** Admin manual review — allow EXPIRED or late WAITING_PAYMENT orders. */
  async markPaidAfterManualReviewInTransaction(
    tx: import('@prisma/client').Prisma.TransactionClient,
    orderId: string,
    paymentId: string,
  ): Promise<void> {
    const order = await tx.order.findFirst({
      where: { id: orderId, deletedAt: null },
      select: { paymentStatus: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.paymentStatus === OrderPaymentStatus.PAID) {
      return;
    }

    if (
      order.paymentStatus !== OrderPaymentStatus.WAITING_PAYMENT &&
      order.paymentStatus !== OrderPaymentStatus.EXPIRED
    ) {
      throw new BadRequestException(
        'Order cannot be marked paid from manual review',
      );
    }

    await this.orderRepository.updatePaymentStatus(
      orderId,
      OrderPaymentStatus.PAID,
      tx,
    );
    await this.orderRepository.linkActivePayment(orderId, paymentId, tx);
  }

  async markPaymentFailed(orderId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.markPaymentFailedInTransaction(tx, orderId);
    });
  }

  async markPaymentFailedInTransaction(
    tx: import('@prisma/client').Prisma.TransactionClient,
    orderId: string,
  ): Promise<void> {
    const order = await tx.order.findFirst({
      where: { id: orderId, deletedAt: null },
      select: { paymentStatus: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    assertPaymentTransition(order.paymentStatus, OrderPaymentStatus.FAILED);
    await this.orderRepository.updatePaymentStatus(
      orderId,
      OrderPaymentStatus.FAILED,
      tx,
    );
  }

  private resolvePaymentMethod(code?: string) {
    if (code?.trim()) {
      const method = this.settingsStore.resolvePaymentMethod(code);
      if (!method) {
        throw new BadRequestException('Payment method is not available');
      }
      return method;
    }

    const methods = this.settingsStore.getPublicPaymentMethods();
    if (!methods.length) {
      throw new BadRequestException('No payment methods are available');
    }
    const fallback = this.settingsStore.resolvePaymentMethod(methods[0].methodCode);
    if (!fallback) {
      throw new BadRequestException('No payment methods are available');
    }
    return fallback;
  }

  private async resolveLineItems(dto: CreateOrderDto): Promise<ResolvedLineItem[]> {
    const resolved: ResolvedLineItem[] = [];

    for (const item of dto.items) {
      const variant = await this.variantRepository.findActiveById(item.variantId);
      if (!variant) {
        throw new BadRequestException(
          `Variant ${item.variantId} is not available`,
        );
      }

      const dataEnabled = this.settingsStore.resolveSystemConfig().customerDataEnabled === true;
      if (
        !dataEnabled &&
        (variant.type === 'DATA' || variant.product.homeService === 'DATA')
      ) {
        throw new AppHttpException(
          ErrorCode.SERVICE_UNAVAILABLE,
          'Dịch vụ nạp data tạm ngưng.',
          HttpStatus.BAD_REQUEST,
        );
      }

      const unitPriceStr = await this.pricingService.getCustomerPrice(
        item.variantId,
      );
      const unitPrice = new Decimal(unitPriceStr);
      const faceValue = new Decimal(variant.faceValue);
      const perUnitDiscount = Decimal.max(new Decimal(0), faceValue.sub(unitPrice));
      const lineDiscount = perUnitDiscount.mul(item.quantity);
      const lineTotal = unitPrice.mul(item.quantity);

      const lowestCost = await this.mappingRepository.findLowestActiveCost(
        item.variantId,
      );
      const lineProviderCost = lowestCost
        ? new Decimal(lowestCost.providerCost).mul(item.quantity)
        : new Decimal(0);

      resolved.push({
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice,
        faceValue,
        lineDiscount,
        lineTotal,
        lineProviderCost,
      });
    }

    return resolved;
  }

  private async getPaymentTimeoutMinutes(): Promise<number> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: 'payment.timeout_minutes' },
    });

    const value = setting?.value;
    if (typeof value === 'number' && value > 0) {
      return value;
    }

    return DEFAULT_PAYMENT_TIMEOUT_MINUTES;
  }
}
