import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, UserRole } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { calculateCustomerPaid, calculateProfit } from '../payment/entities/payment-fee.engine';
import { DEFAULT_PAYMENT_TIMEOUT_MINUTES } from '../order/entities/order.constants';
import { generateOrderCode, generateTransactionId } from '../order/entities/order-code.generator';
import { mapOrder } from '../order/entities/order.mapper';
import { CreateOrderDto } from '../order/dto/create-order.dto';
import { OrderRepository } from '../order/repositories/order.repository';
import { VariantRepository } from '../product/repositories/variant.repository';
import { PricingService } from '../product/services/pricing.service';
import { ProviderRegistryService } from '../provider/services/provider-registry.service';
import { SettingsStoreService } from '../settings/services/settings-store.service';
import { evaluatePaypalEsimLimits } from '../payment/entities/paypal-limits.rules';
import { ACTIVE_ORDER_WHERE } from '../order/entities/order.constants';
import { evaluateEsimMarketPayment, type EsimMarket } from './esim-market.rules';
import {
  ESIM_ORDER_REUSE_PAYMENTS,
  esimOrderCreateLockPair,
  isReusableEsimOrder,
} from './esim-order-idempotency';
import { evaluateEsimSale, esimSaleFlagsFromRuntime } from './esim-policy';

export type EsimCreateOptions = {
  /** Internal only. Public POST /orders must never set this. */
  adminTest?: boolean;
};

@Injectable()
export class EsimOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orderRepository: OrderRepository,
    private readonly variantRepository: VariantRepository,
    private readonly pricingService: PricingService,
    private readonly providerRegistry: ProviderRegistryService,
    private readonly settingsStore: SettingsStoreService,
    private readonly configService: ConfigService,
  ) {}

  async createAdminTest(
    dto: CreateOrderDto,
    user: AuthenticatedUser,
    requestMeta?: { ip?: string | null; userAgent?: string | null },
  ) {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Insufficient role');
    }
    return this.create(dto, user, requestMeta, { adminTest: true });
  }

  async create(
    dto: CreateOrderDto,
    user: AuthenticatedUser | undefined,
    requestMeta?: { ip?: string | null; userAgent?: string | null },
    options?: EsimCreateOptions,
  ) {
    if (!user?.id) {
      throw new UnauthorizedException('Login required for eSIM');
    }
    if (dto.items.length !== 1 || dto.items[0].quantity !== 1) {
      throw new BadRequestException('An eSIM order contains one item with quantity 1');
    }

    const adminTest = options?.adminTest === true && user.role === UserRole.SUPER_ADMIN;
    if (options?.adminTest === true && !adminTest) {
      throw new ForbiddenException('Insufficient role');
    }

    const flags = esimSaleFlagsFromRuntime(
      (key) => this.configService.get(key),
      this.settingsStore.resolveSystemConfig().customerEsimEnabled === true,
    );
    const sale = evaluateEsimSale(flags);
    let mode: 'mock' | 'live';
    if (sale.ok) {
      mode = sale.mode;
    } else if (adminTest && flags.envEnabled === true && sale.reason === 'SALES_DISABLED') {
      if (flags.providerMode === 'live' && flags.liveArm !== true) {
        throw new BadRequestException('eSIM live provider is disabled');
      }
      mode = flags.providerMode === 'live' ? 'live' : 'mock';
    } else {
      throw new BadRequestException(
        sale.reason === 'SALES_DISABLED'
          ? 'eSIM sales are disabled'
          : 'eSIM live provider is disabled',
      );
    }

    const item = dto.items[0];
    const variant = await this.variantRepository.findActiveById(item.variantId);
    if (!variant || String(variant.type) !== 'ESIM') {
      throw new BadRequestException('Variant is not an active eSIM');
    }

    const selected = await this.selectAiraloMapping(variant.id);

    const unitPrice = new Decimal(await this.pricingService.getCustomerPrice(variant.id));
    const faceValue = new Decimal(variant.faceValue);
    const sellAmount = unitPrice;
    const providerCost = new Decimal(selected.mapping.providerCost);
    const paymentMethod = this.resolvePaymentMethod(dto.paymentMethodCode);
    const market = this.resolveEsimMarket(dto.market);
    const marketCheck = evaluateEsimMarketPayment({
      market,
      currency: paymentMethod.gatewayCode === 'PAYPAL' ? 'USD' : 'VND',
      gateway: paymentMethod.gatewayCode,
      homeService: 'ESIM',
    });
    if (!marketCheck.ok) {
      throw new BadRequestException(`eSIM payment route rejected: ${marketCheck.reason}`);
    }
    if (marketCheck.gateway === 'PAYPAL') {
      const limitCheck = evaluatePaypalEsimLimits({
        quantity: 1,
        amountUsd: Number(sellAmount.toFixed(2)),
        ordersPaidToday: 0,
        usdPaidToday: 0,
        accountAgeHours: null,
      });
      if (!limitCheck.ok) {
        throw new BadRequestException(`PayPal eSIM limit: ${limitCheck.reason}`);
      }
    }
    const feeResult = calculateCustomerPaid(
      Number(sellAmount.toFixed(0)),
      paymentMethod.percentageFee,
      paymentMethod.fixedFee,
    );
    const paymentFeeAmount = new Decimal(feeResult.paymentFee);
    const customerPaid = new Decimal(feeResult.totalPayment);
    const profit = new Decimal(
      calculateProfit(
        feeResult.totalPayment,
        feeResult.paymentFee,
        Number(providerCost.toFixed(0)),
      ),
    );
    const paymentExpiresAt = new Date(Date.now() + DEFAULT_PAYMENT_TIMEOUT_MINUTES * 60_000);
    const orderCode = generateOrderCode();
    const txnCode = generateTransactionId();

    const order = await this.prisma.$transaction(async (tx) => {
      await this.lockEsimOrderCreate(tx, user.id, variant.id);
      const reusable = await this.findReusableEsimOrder(tx, user.id, variant.id);
      if (reusable) {
        return reusable;
      }
      const financial = await this.orderRepository.createFinancialTransaction(tx, {
        transactionId: txnCode,
        amount: customerPaid,
      });
      const created = await this.orderRepository.createWithTransaction(tx, {
        orderCode,
        transactionId: financial.id,
        userId: user.id,
        guestEmail: user.email,
        isGuestOrder: false,
        invoiceRequired: false,
        invoiceMetadata: {},
        customerNote: dto.customerNote,
        clientTrace: {
          customerId: user.id,
          customerEmail: user.email,
          ipAddress: requestMeta?.ip ?? null,
          userAgent: requestMeta?.userAgent ?? null,
          capturedAt: new Date().toISOString(),
          ...(adminTest ? { adminTest: true } : {}),
        } as Prisma.InputJsonValue,
        totalAmount: customerPaid,
        faceValue,
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
      });
      const orderItem = await this.orderRepository.createOrderItem(tx, {
        orderId: created.id,
        variantId: variant.id,
        quantity: 1,
        unitPrice,
        discount: new Decimal(0),
        totalAmount: unitPrice,
      });
      await tx.esimOrderQuote.create({
        data: {
          orderItemId: orderItem.id,
          providerId: selected.provider.id,
          providerProductCode: selected.mapping.providerProductCode,
          providerCost,
          providerMode: mode === 'live' ? 'LIVE' : 'MOCK',
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
      throw new BadRequestException('eSIM order creation failed');
    }
    return mapOrder(order);
  }

  private async lockEsimOrderCreate(
    tx: Prisma.TransactionClient,
    userId: string,
    variantId: string,
  ): Promise<void> {
    const [userKey, variantKey] = esimOrderCreateLockPair(userId, variantId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userKey}), hashtext(${variantKey}))`;
  }

  private async findReusableEsimOrder(
    tx: Prisma.TransactionClient,
    userId: string,
    variantId: string,
  ) {
    const now = new Date();
    const rows = await tx.order.findMany({
      where: {
        userId,
        ...ACTIVE_ORDER_WHERE,
        paymentStatus: { in: [...ESIM_ORDER_REUSE_PAYMENTS] },
        orderItems: { some: { variantId, variant: { type: 'ESIM' } } },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        orderItems: { include: { variant: { select: { sku: true, name: true } } } },
      },
    });
    return rows.find((row) => isReusableEsimOrder(row, now)) ?? null;
  }

  private resolveEsimMarket(raw?: string): EsimMarket {
    const value = (raw ?? 'VN').trim().toUpperCase();
    if (value === 'INTL' || value === 'INTERNATIONAL') return 'INTL';
    return 'VN';
  }

  /**
   * Airalo only. Not an eSale adapter. Card fulfillment must not resolve this code.
   * Unit tests that stub the registry still use that path when Prisma is absent.
   */
  private async selectAiraloMapping(variantId: string) {
    const mappings = this.prisma.providerProductMapping;
    if (mappings?.findFirst) {
      const airalo = await mappings.findFirst({
        where: {
          productVariantId: variantId,
          status: 'ACTIVE',
          availability: 'AVAILABLE',
          provider: { code: 'AIRALO', status: 'ACTIVE', deletedAt: null },
        },
        orderBy: [{ priority: 'asc' }, { providerCost: 'asc' }],
        include: { provider: { select: { id: true } } },
      });
      if (airalo) {
        return { provider: airalo.provider, mapping: airalo };
      }
      throw new BadRequestException('No AIRALO mapping is published for this eSIM');
    }

    try {
      const selections = await this.providerRegistry.listForVariant(variantId);
      const selected = selections[0];
      if (!selected) {
        throw new BadRequestException('No eSIM provider is available');
      }
      return selected;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new BadRequestException('No eSIM provider is available');
      }
      throw error;
    }
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
    const fallback = methods[0]
      ? this.settingsStore.resolvePaymentMethod(methods[0].methodCode)
      : undefined;
    if (!fallback) {
      throw new BadRequestException('No payment methods are available');
    }
    return fallback;
  }
}
