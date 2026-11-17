import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { OrderPaymentStatus, Prisma, ProductVariantType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { calculateCustomerPaid, calculateProfit } from '../payment/entities/payment-fee.engine';
import { DEFAULT_PAYMENT_TIMEOUT_MINUTES, ACTIVE_ORDER_WHERE } from '../order/entities/order.constants';
import { generateOrderCode, generateTransactionId } from '../order/entities/order-code.generator';
import { mapOrder } from '../order/entities/order.mapper';
import { OrderRepository } from '../order/repositories/order.repository';
import { SettingsStoreService } from '../settings/services/settings-store.service';
import { buildEsimVndPriceSnapshot } from './esim-order-snapshot';
import { evaluateEsimSale, esimSaleFlagsFromRuntime } from './esim-policy';
import { ConfigService } from '@nestjs/config';
import { EsimTopupService } from './esim-topup.service';
import {
  costVndFromAiralo,
  retailVndFromAiralo,
  sellPriceFromAiralo,
} from './esim-catalogue.rules';

/**
 * Customer-paid eSIM top-up checkout (VN). Creates a PAID-later order that fulfills via
 * Airalo POST /v2/orders/topups after payment — not a new SIM CREATE.
 */
@Injectable()
export class EsimTopupCheckoutService {
  private readonly logger = new Logger(EsimTopupCheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orderRepository: OrderRepository,
    private readonly settingsStore: SettingsStoreService,
    private readonly configService: ConfigService,
    private readonly topups: EsimTopupService,
  ) {}

  async createCheckout(
    user: AuthenticatedUser,
    parentOrderId: string,
    packageId: string,
    paymentMethodCode: string,
  ) {
    const flags = esimSaleFlagsFromRuntime(
      (key) => this.configService.get(key),
      this.settingsStore.resolveSystemConfig().customerEsimEnabled === true,
    );
    const sale = evaluateEsimSale(flags);
    if (!sale.ok) {
      throw new BadRequestException(
        sale.reason === 'SALES_DISABLED' ? 'Chưa mở bán eSIM' : 'eSIM live chưa sẵn sàng',
      );
    }

    const parent = await this.prisma.order.findFirst({
      where: {
        id: parentOrderId,
        userId: user.id,
        ...ACTIVE_ORDER_WHERE,
        paymentStatus: OrderPaymentStatus.PAID,
        orderItems: { some: { variant: { type: ProductVariantType.ESIM } } },
      },
      select: {
        id: true,
        orderItems: {
          where: { variant: { type: ProductVariantType.ESIM } },
          select: {
            variantId: true,
            variant: { select: { id: true, name: true, sku: true } },
            esimProfile: { select: { iccid: true } },
            esimQuote: { select: { providerId: true } },
          },
          take: 1,
        },
      },
    });
    const item = parent?.orderItems[0];
    const iccid = item?.esimProfile?.iccid?.trim();
    if (!parent || !item || !iccid) {
      throw new NotFoundException('eSIM profile not found or missing ICCID');
    }

    const listed = await this.topups.listForOrder(parentOrderId, user.id);
    const pack = listed.packages.find((row) => row.providerPackageId === packageId.trim());
    if (!pack) {
      throw new BadRequestException('Top-up package is not available for this eSIM');
    }

    const usdVndRate = this.settingsStore.resolveAiraloUsdVndRate();
    const cost = costVndFromAiralo({
      netPriceVnd: pack.netPriceVnd,
      netPriceUsd: pack.netPriceUsd ?? pack.price,
      usdVndRate,
    });
    const retailVnd = retailVndFromAiralo({
      retailPriceVnd: pack.retailPriceVnd,
      retailPriceUsd: pack.retailPriceUsd,
      usdVndRate,
    });
    const sellVnd = sellPriceFromAiralo(cost.costVnd, retailVnd);
    if (!sellVnd || !cost.costVnd) {
      throw new BadRequestException('Top-up price unavailable');
    }

    const paymentMethod =
      this.settingsStore.resolveEsimPaymentMethod(paymentMethodCode) ??
      this.settingsStore.resolvePaymentMethod(paymentMethodCode);
    if (!paymentMethod || !this.settingsStore.resolveEsimPaymentMethod(paymentMethod.methodCode)) {
      throw new BadRequestException('Payment method is not available for eSIM');
    }
    if (paymentMethod.gatewayCode === 'PAYPAL') {
      throw new BadRequestException('PayPal top-up is not available yet. Use VietQR.');
    }

    const sellAmount = new Decimal(sellVnd);
    const providerCost = new Decimal(cost.costVnd);
    const unitPrice = sellAmount;
    const feeResult = calculateCustomerPaid(
      sellVnd,
      paymentMethod.percentageFee,
      paymentMethod.fixedFee,
    );
    const paymentFeeAmount = new Decimal(feeResult.paymentFee);
    const customerPaid = new Decimal(feeResult.totalPayment);
    const profit = new Decimal(
      calculateProfit(feeResult.totalPayment, feeResult.paymentFee, cost.costVnd),
    );
    if (profit.lt(0)) {
      throw new BadRequestException('eSIM top-up price rejected: NEGATIVE_MARGIN');
    }

    const pricingLockedAt = new Date();
    const paymentExpiresAt = new Date(Date.now() + DEFAULT_PAYMENT_TIMEOUT_MINUTES * 60_000);
    const vndSnapshot = buildEsimVndPriceSnapshot({
      sellAmount,
      chargeAmount: customerPaid,
      market: 'VN',
      lockedAt: pricingLockedAt,
    });
    const orderCode = generateOrderCode();
    const txnCode = generateTransactionId();
    const providerId = item.esimQuote?.providerId;
    if (!providerId) {
      throw new BadRequestException('eSIM provider mapping missing');
    }

    const mode = sale.mode === 'live' ? 'LIVE' : 'MOCK';
    const order = await this.prisma.$transaction(async (tx) => {
      const financial = await this.orderRepository.createFinancialTransaction(tx, {
        transactionId: txnCode,
        amount: customerPaid,
      });
      const created = await this.orderRepository.createWithTransaction(tx, {
        orderCode,
        transactionId: financial.id,
        userId: user.id,
        guestEmail: user.email?.trim().toLowerCase() || undefined,
        isGuestOrder: false,
        invoiceRequired: false,
        invoiceMetadata: {},
        customerNote: `Gia hạn eSIM ${pack.title}`,
        clientTrace: {
          customerId: user.id,
          customerEmail: user.email ?? null,
          isGuestOrder: false,
          locale: 'vi',
          capturedAt: new Date().toISOString(),
          esimLane: 'topup',
          parentOrderId: parent.id,
          iccid,
          packageId: pack.providerPackageId,
          packageTitle: pack.title,
        } as Prisma.InputJsonValue,
        totalAmount: customerPaid,
        faceValue: unitPrice,
        sellAmount,
        discountAmount: new Decimal(0),
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
        catalogCurrency: vndSnapshot.catalogCurrency,
        catalogAmount: vndSnapshot.catalogAmount,
        chargeCurrency: vndSnapshot.chargeCurrency,
        chargeAmount: vndSnapshot.chargeAmount,
        costCurrency: cost.costCurrency,
        costAmount: new Decimal(cost.costAmount),
        fxRateId: null,
        fxRateValue: null,
        fxAsOf: null,
        esimMarket: 'VN',
        pricingLockedAt,
      });
      const orderItem = await this.orderRepository.createOrderItem(tx, {
        orderId: created.id,
        variantId: item.variantId,
        quantity: 1,
        unitPrice,
        discount: new Decimal(0),
        totalAmount: unitPrice,
      });
      await tx.esimOrderQuote.create({
        data: {
          orderItemId: orderItem.id,
          providerId,
          providerProductCode: pack.providerPackageId,
          providerCost,
          providerMode: mode,
          catalogCurrency: vndSnapshot.catalogCurrency,
          catalogUnitAmount: vndSnapshot.catalogAmount,
          chargeCurrency: vndSnapshot.chargeCurrency,
          chargeAmount: vndSnapshot.chargeAmount,
          costCurrency: cost.costCurrency,
          costAmount: new Decimal(cost.costAmount),
          snapshotAt: pricingLockedAt,
        },
      });
      return tx.order.findFirst({
        where: { id: created.id },
        include: {
          orderItems: { include: { variant: { select: { sku: true, name: true } } } },
        },
      });
    });

    if (!order) {
      throw new BadRequestException('eSIM top-up order creation failed');
    }
    this.logger.log(
      JSON.stringify({
        event: 'ESIM_TOPUP_CHECKOUT_CREATED',
        orderId: order.id,
        parentOrderId: parent.id,
        packageId: pack.providerPackageId,
        sellVnd,
      }),
    );
    return mapOrder(order);
  }
}
