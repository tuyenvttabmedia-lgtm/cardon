import {
  BadRequestException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderPaymentStatus, Prisma, ProductVariantType, UserRole } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { ErrorCode } from '../../common/constants/error-codes.constants';
import { AppHttpException } from '../../common/exceptions/app-http.exception';
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
import { evaluatePaypalCheckoutReady } from '../payment/providers/paypal/paypal.rules';
import { buildEsimBuyerCheckoutOptions } from './esim-checkout-options';
import { formatCatalogVnd, parseAdminTestAmountUsd, readAdminTestCharge, readAdminTestFulfillmentSkip } from './esim-admin-test.rules';
import {
  accountAgeHoursFromCreatedAt,
  ESIM_ORDER_AMOUNT_LIMIT_MESSAGE,
  evaluateEsimChargeLimit,
  resolveEsimChargeLimitConfig,
} from './esim-charge-limit.rules';
import { ACTIVE_ORDER_WHERE } from '../order/entities/order.constants';
import { evaluateEsimMarketPayment, type EsimMarket } from './esim-market.rules';
import { resolveRetailMarket } from '../product/entities/retail-market';
import { MANUAL_USD_VND_SOURCE, convertVndSellToUsd, selectCheckoutFx } from '../fx/fx-rate.rules';
import {
  ESIM_ORDER_REUSE_PAYMENTS,
  esimOrderCreateLockPair,
  isReusableEsimOrder,
} from './esim-order-idempotency';
import { evaluateEsimSale, esimSaleFlagsFromRuntime } from './esim-policy';
import { buildEsimVndPriceSnapshot } from './esim-order-snapshot';

export type EsimCreateOptions = {
  /** Internal only. Public POST /orders must never set this. */
  adminTest?: boolean;
  /** Internal only. Admin PayPal sandbox charge. Never a customer order field. */
  testAmountUsd?: string;
};

@Injectable()
export class EsimOrderService {
  private readonly logger = new Logger(EsimOrderService.name);

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
    requestMeta?: { ip?: string | null; userAgent?: string | null; countryCode?: string | null },
    testAmountUsd?: string,
  ) {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Insufficient role');
    }
    return this.create(dto, user, requestMeta, { adminTest: true, testAmountUsd });
  }

  async create(
    dto: CreateOrderDto,
    user: AuthenticatedUser | undefined,
    requestMeta?: { ip?: string | null; userAgent?: string | null; countryCode?: string | null },
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
    // Never charge real money for mock LPA in production customer checkout.
    if (
      mode === 'mock' &&
      !adminTest &&
      this.configService.get<string>('APP_ENV') === 'production'
    ) {
      throw new BadRequestException('eSIM live provider is disabled');
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
    const market = this.marketForSelectedGateway(paymentMethod.gatewayCode, requestMeta?.countryCode);
    if (dto.market && this.resolveEsimMarket(dto.market) !== market) {
      throw new BadRequestException('eSIM market does not match the payment method');
    }
    const marketCheck = evaluateEsimMarketPayment({
      market,
      currency: paymentMethod.gatewayCode === 'PAYPAL' ? 'USD' : 'VND',
      gateway: paymentMethod.gatewayCode,
      homeService: 'ESIM',
    });
    if (!marketCheck.ok) {
      throw new BadRequestException(`eSIM payment route rejected: ${marketCheck.reason}`);
    }
    let adminTestCharge: ReturnType<typeof readAdminTestCharge> = null;
    if (adminTest && paymentMethod.gatewayCode === 'PAYPAL') {
      const parsed = parseAdminTestAmountUsd(options?.testAmountUsd);
      if (!parsed.ok) {
        throw new BadRequestException(
          'PayPal admin test amount must be from 0.01 to 80.00 USD with at most two decimal places',
        );
      }
      const paypalMode = this.settingsStore.resolvePaypalConfig().mode;
      if (paypalMode !== 'sandbox') {
        throw new BadRequestException('Admin test PayPal requires sandbox mode');
      }
      adminTestCharge = {
        currency: 'USD',
        amount: parsed.amount,
        mode: 'sandbox',
        catalogCurrency: 'VND',
        catalogSellAmountVnd: formatCatalogVnd(sellAmount),
      };
    } else if (
      adminTest &&
      options?.testAmountUsd !== undefined &&
      options.testAmountUsd !== ''
    ) {
      throw new BadRequestException('testAmountUsd is only valid for PayPal admin test orders');
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
    const pricingLockedAt = new Date();
    const customerIntl = market === 'INTL' && !adminTest;
    if (customerIntl && (!sellAmount.gt(0) || !customerPaid.gt(0) || !providerCost.gt(0))) {
      throw new BadRequestException('eSIM price rejected: INVALID_PRICE');
    }
    // Never sell below provider cost (+ fee) on customer checkout.
    if (!adminTest && profit.lt(0)) {
      throw new BadRequestException('eSIM price rejected: NEGATIVE_MARGIN');
    }
    const vndSnapshot = buildEsimVndPriceSnapshot({
      sellAmount,
      chargeAmount: customerPaid,
      market,
      lockedAt: pricingLockedAt,
    });
    const orderCode = generateOrderCode();
    const txnCode = generateTransactionId();
    // Customer PayPal: age from DB createdAt only (never JWT/FE). Admin-test skips new-account 30.
    const accountAgeHours = adminTest
      ? Number.POSITIVE_INFINITY
      : await this.resolveCustomerAccountAgeHours(user.id);

    const order = await this.prisma.$transaction(async (tx) => {
      await this.lockEsimOrderCreate(tx, user.id, variant.id);
      const reusable = await this.findReusableEsimOrder(
        tx,
        user.id,
        variant.id,
        market,
        paymentMethod.gatewayCode,
        customerIntl,
        adminTestCharge
          ? { gateway: 'PAYPAL', chargeAmountUsd: adminTestCharge.amount }
          : undefined,
      );
      if (reusable) {
        return reusable;
      }
      const priceSnapshot = customerIntl
        ? await this.lockIntlUsdPrice(tx, {
            sellAmount,
            customerPaid,
            providerCost,
            variantId: variant.id,
            lockedAt: pricingLockedAt,
          })
        : {
            ...vndSnapshot,
            costCurrency: null,
            costAmount: null,
            fxRateId: null,
            fxRateValue: null,
            fxAsOf: null,
          };
      // Admin-test PayPal charges a sandbox USD amount; otherwise use server charge snapshot.
      const limitChargeAmount = adminTestCharge
        ? adminTestCharge.amount
        : priceSnapshot.chargeAmount.toString();
      const limitChargeCurrency = adminTestCharge
        ? adminTestCharge.currency
        : priceSnapshot.chargeCurrency;
      await this.assertEsimChargeWithinLimit({
        userId: user.id,
        market,
        gateway: paymentMethod.gatewayCode,
        chargeAmount: limitChargeAmount,
        chargeCurrency: limitChargeCurrency,
        accountAgeHours,
      });
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
          locale: dto.locale === 'en' ? 'en' : 'vi',
          capturedAt: new Date().toISOString(),
          ...(adminTest ? { adminTest: true } : {}),
          ...(adminTestCharge ? { adminTestCharge } : {}),
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
        catalogCurrency: priceSnapshot.catalogCurrency,
        catalogAmount: priceSnapshot.catalogAmount,
        chargeCurrency: priceSnapshot.chargeCurrency,
        chargeAmount: priceSnapshot.chargeAmount,
        costCurrency: priceSnapshot.costCurrency,
        costAmount: priceSnapshot.costAmount,
        fxRateId: priceSnapshot.fxRateId,
        fxRateValue: priceSnapshot.fxRateValue,
        fxAsOf: priceSnapshot.fxAsOf,
        esimMarket: priceSnapshot.esimMarket,
        pricingLockedAt: priceSnapshot.pricingLockedAt,
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
          catalogCurrency: priceSnapshot.catalogCurrency,
          catalogUnitAmount: priceSnapshot.catalogAmount,
          chargeCurrency: priceSnapshot.chargeCurrency,
          chargeAmount: priceSnapshot.chargeAmount,
          costCurrency: priceSnapshot.costCurrency,
          costAmount: priceSnapshot.costAmount,
          fxRateId: priceSnapshot.fxRateId,
          fxRateValue: priceSnapshot.fxRateValue,
          fxAsOf: priceSnapshot.fxAsOf,
          snapshotAt: priceSnapshot.pricingLockedAt,
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

  /**
   * Load account age from User.createdAt (DB). Fail-closed → null (treated as new / 30 USD).
   */
  private async resolveCustomerAccountAgeHours(userId: string): Promise<number | null> {
    try {
      const row = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { createdAt: true },
      });
      const age = accountAgeHoursFromCreatedAt(row?.createdAt ?? null);
      if (age == null) {
        this.logger.warn(
          JSON.stringify({
            event: 'ESIM_ACCOUNT_AGE_FALLBACK',
            reason: row ? 'INVALID_CREATED_AT' : 'USER_NOT_FOUND',
            userId,
            at: new Date().toISOString(),
          }),
        );
        return null;
      }
      return age;
    } catch {
      this.logger.warn(
        JSON.stringify({
          event: 'ESIM_ACCOUNT_AGE_FALLBACK',
          reason: 'DB_LOOKUP_FAILED',
          userId,
          at: new Date().toISOString(),
        }),
      );
      return null;
    }
  }

  /**
   * Phase A — reject oversized eSIM charges before financial txn / order rows.
   * Uses server charge snapshot (or admin-test sandbox USD), never client-declared amounts.
   */
  private async assertEsimChargeWithinLimit(input: {
    userId: string;
    market: EsimMarket;
    gateway: string;
    chargeAmount: number | string;
    chargeCurrency: string;
    accountAgeHours: number | null;
  }): Promise<void> {
    const system = this.settingsStore.resolveSystemConfig();
    const limits = resolveEsimChargeLimitConfig({
      esimMaxChargeAmountVnd: system.esimMaxChargeAmountVnd,
      esimMaxChargeAmountUsd: system.esimMaxChargeAmountUsd,
    });
    const velocity = await this.readEsimPaidVelocityToday(input.userId);
    const result = evaluateEsimChargeLimit({
      chargeAmount: input.chargeAmount,
      chargeCurrency: input.chargeCurrency,
      maxVnd: limits.maxVnd,
      maxUsd: limits.maxUsd,
      accountAgeHours: input.accountAgeHours,
      quantity: 1,
      ordersPaidToday: velocity.ordersPaidToday,
      usdPaidToday: velocity.usdPaidToday,
    });
    if (result.ok) {
      return;
    }
    this.logger.warn(
      JSON.stringify({
        event: 'ESIM_ORDER_AMOUNT_LIMIT',
        userId: input.userId,
        market: input.market,
        gateway: input.gateway,
        chargeAmount: result.chargeAmount,
        chargeCurrency: result.chargeCurrency,
        configuredLimit: result.configuredLimit,
        effectiveLimit: result.effectiveLimit,
        reason: result.reason,
        paypalReason: 'paypalReason' in result ? result.paypalReason : undefined,
        at: new Date().toISOString(),
      }),
    );
    if (result.reason === 'PAYPAL_ESIM_LIMIT') {
      throw new BadRequestException(`PayPal eSIM limit: ${result.paypalReason}`);
    }
    throw new AppHttpException(
      ErrorCode.ESIM_ORDER_AMOUNT_LIMIT,
      ESIM_ORDER_AMOUNT_LIMIT_MESSAGE,
      HttpStatus.BAD_REQUEST,
    );
  }

  private async readEsimPaidVelocityToday(userId: string): Promise<{
    ordersPaidToday: number;
    usdPaidToday: number;
  }> {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const rows = await this.prisma.order.findMany({
      where: {
        userId,
        ...ACTIVE_ORDER_WHERE,
        paymentStatus: OrderPaymentStatus.PAID,
        createdAt: { gte: start },
        orderItems: { some: { variant: { type: ProductVariantType.ESIM } } },
      },
      select: { chargeCurrency: true, chargeAmount: true },
    });
    let usdPaidToday = 0;
    for (const row of rows) {
      if ((row.chargeCurrency ?? '').toUpperCase() !== 'USD' || row.chargeAmount == null) continue;
      const amount = Number(row.chargeAmount.toString());
      if (Number.isFinite(amount) && amount > 0) usdPaidToday += amount;
    }
    return { ordersPaidToday: rows.length, usdPaidToday };
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
    market: EsimMarket,
    gatewayCode: string,
    requireUsdSnapshot: boolean,
    paypalCharge?: { gateway: 'PAYPAL'; chargeAmountUsd: string },
  ) {
    const gateway = gatewayCode.trim().toUpperCase();
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
    return (
      rows.find((row) => {
        if (!isReusableEsimOrder(row, now)) return false;
        if (row.esimMarket && row.esimMarket !== market) return false;
        if ((row.paymentGateway ?? '').toUpperCase() !== gateway) return false;
        if (requireUsdSnapshot && (row.esimMarket !== 'INTL' || row.chargeCurrency !== 'USD')) {
          return false;
        }
        if (!paypalCharge) return true;
        if (row.paymentGateway !== paypalCharge.gateway) return false;
        if (readAdminTestFulfillmentSkip(row.clientTrace)) return false;
        return readAdminTestCharge(row.clientTrace)?.amount === paypalCharge.chargeAmountUsd;
      }) ?? null
    );
  }

  /** Gateway picks the snapshot. A confirmed foreign connection cannot open a Vietnam SePay charge. */
  private marketForSelectedGateway(gatewayCode: string, countryCode?: string | null): EsimMarket {
    const gateway = gatewayCode.trim().toUpperCase();
    if (gateway === 'PAYPAL') return 'INTL';
    if (gateway === 'SEPAY') {
      if (resolveRetailMarket(countryCode) === 'INTL') {
        throw new BadRequestException('eSIM SePay is only available for a Vietnam connection');
      }
      return 'VN';
    }
    throw new BadRequestException('eSIM payment route rejected: UNSUPPORTED_GATEWAY');
  }

  private async lockIntlUsdPrice(
    tx: Prisma.TransactionClient | PrismaService,
    input: {
      sellAmount: Decimal;
      customerPaid: Decimal;
      providerCost: Decimal;
      variantId: string;
      lockedAt: Date;
    },
  ) {
    const rows = await tx.fxRate.findMany({
      where: { sourceCode: MANUAL_USD_VND_SOURCE },
      include: { source: true },
    });
    const selected = selectCheckoutFx(
      rows.map((row) => ({
        id: row.id,
        status: row.status,
        rate: row.rate,
        observedAt: row.observedAt,
        effectiveFrom: row.effectiveFrom,
        effectiveTo: row.effectiveTo,
        maxStalenessSeconds: row.source.maxStalenessSeconds,
        baseCurrency: row.source.baseCurrency,
        quoteCurrency: row.source.quoteCurrency,
      })),
      new Date(),
    );
    if (!selected.ok) {
      throw new BadRequestException(`eSIM price rejected: ${selected.reason}`);
    }
    const converted = convertVndSellToUsd(input.customerPaid, selected.rate);
    if (!converted.ok) {
      throw new BadRequestException(`eSIM price rejected: ${converted.reason}`);
    }
    const cost = await this.readPackageCost(input.variantId, input.providerCost);
    return {
      catalogCurrency: 'VND' as const,
      catalogAmount: input.sellAmount,
      chargeCurrency: 'USD' as const,
      chargeAmount: converted.usd,
      costCurrency: cost.currency,
      costAmount: cost.amount,
      fxRateId: selected.row.id,
      fxRateValue: selected.rate,
      fxAsOf: selected.row.observedAt,
      esimMarket: 'INTL' as const,
      pricingLockedAt: input.lockedAt,
    };
  }

  private async readPackageCost(variantId: string, providerCost: Decimal) {
    const packages = this.prisma.esimAiraloPackage;
    if (packages?.findFirst) {
      const row = await packages.findFirst({
        where: { variantId, lifecycle: 'PUBLISHED' },
        select: { costCurrency: true, costAmount: true },
      });
      if (row) {
        const amount = new Decimal(row.costAmount.toString());
        if (!amount.gt(0) || !row.costCurrency) {
          throw new BadRequestException('eSIM price rejected: INVALID_COST');
        }
        return { currency: row.costCurrency, amount };
      }
    }
    if (!providerCost.gt(0)) {
      throw new BadRequestException('eSIM price rejected: INVALID_COST');
    }
    return { currency: 'VND', amount: providerCost };
  }

  async quote(variantId: string, buyerMarket: 'VN' | 'INTL' = 'VN') {
    const variant = await this.variantRepository.findActiveById(variantId);
    if (!variant || String(variant.type) !== 'ESIM') {
      throw new NotFoundException('eSIM variant not found');
    }
    const selected = await this.selectAiraloMapping(variant.id);
    const unitPrice = await this.pricingService.getCustomerPrice(variant.id);
    const sellAmount = new Decimal(unitPrice);
    const providerCost = new Decimal(selected.mapping.providerCost);
    const referenceAmount = sellAmount.toFixed(0);
    const vndCharge = new Decimal(Math.round(Number(sellAmount.toString()))).toFixed(0);
    const sepayReady = this.sepayEsimReady();
    const paypalReady = this.paypalEsimReady();
    let usd: { amount: string; fxRate: string; fxRateId: string; fxAsOf: string } | null = null;
    if (paypalReady) {
      try {
        const locked = await this.lockIntlUsdPrice(this.prisma, {
          sellAmount,
          customerPaid: new Decimal(vndCharge),
          providerCost,
          variantId: variant.id,
          lockedAt: new Date(),
        });
        usd = {
          amount: locked.chargeAmount.toFixed(2),
          fxRate: locked.fxRateValue.toString(),
          fxRateId: locked.fxRateId,
          fxAsOf: locked.fxAsOf.toISOString(),
        };
      } catch (error) {
        if (!(error instanceof BadRequestException)) throw error;
        usd = null;
      }
    }
    const options = buildEsimBuyerCheckoutOptions({
      buyerMarket,
      referenceAmountVnd: referenceAmount,
      vndChargeAmount: vndCharge,
      usd,
      sepayReady,
      paypalReady,
    });
    const selectedOption = options.paymentOptions[0] ?? null;
    return {
      // market = buyer location (cf-ipcountry). Charge currency stays on each option.
      market: buyerMarket,
      buyerMarket,
      catalogCurrency: 'VND',
      catalogAmount: referenceAmount,
      chargeCurrency: selectedOption?.currency ?? null,
      chargeAmount: selectedOption?.amount ?? null,
      fxRateId: selectedOption?.fxRateId ?? null,
      fxRate: selectedOption?.fxRate ?? null,
      fxAsOf: selectedOption?.fxAsOf ?? null,
      paymentOptions: options.paymentOptions,
      unavailableReason: options.unavailableReason,
    };
  }

  /** eSIM Payment Gateway, not the agent-wallet VietQR secret. */
  private sepayEsimReady(): boolean {
    const gateway = this.settingsStore.resolveSepayPaymentGateway();
    return gateway.enabled === true && Boolean(gateway.merchantId?.trim()) && Boolean(gateway.merchantSecretKey?.trim());
  }

  private paypalEsimReady(): boolean {
    return evaluatePaypalCheckoutReady(this.settingsStore.resolvePaypalConfig()).ok;
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
