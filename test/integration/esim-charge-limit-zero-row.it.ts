/**
 * C3 — PostgreSQL proof that over-limit eSIM create commits zero financial/order/payment rows.
 * Runs only against isolated cardon-it (127.0.0.1:5434/cardon_it) via CARDON_IT_DATABASE_URL.
 */
import { spawnSync } from 'child_process';
import { createHash, randomBytes } from 'crypto';
import {
  HomeServiceType,
  PrismaClient,
  ProductVariantType,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { AppHttpException } from '../../src/common/exceptions/app-http.exception';
import { ErrorCode } from '../../src/common/constants/error-codes.constants';
import { EsimOrderService } from '../../src/modules/esim/esim-order.service';
import { ESIM_ORDER_AMOUNT_LIMIT_MESSAGE } from '../../src/modules/esim/esim-charge-limit.rules';
import { OrderRepository } from '../../src/modules/order/repositories/order.repository';
import { VariantRepository } from '../../src/modules/product/repositories/variant.repository';
import { MANUAL_USD_VND_SOURCE } from '../../src/modules/fx/fx-rate.rules';

const MARKER = 'pA-c3';
const IDENTITY_SQL = 'SELECT host(inet_server_addr()) AS addr, current_database() AS database';

function isolatedDatabaseUrl(): string {
  const href = process.env.CARDON_IT_DATABASE_URL ?? '';
  const parsed = new URL(href);
  const database = parsed.pathname.split('/').filter(Boolean)[0];
  if (parsed.hostname !== '127.0.0.1' || parsed.port !== '5434' || database !== 'cardon_it') {
    throw new Error('Database target is not the isolated test database');
  }
  return href;
}

function assertIsolatedProbe(): { addr: string } {
  const probe = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `
      import { readTestDatabaseUrl, parseCardonItUrl, createExplicitPrismaFactory, inspectNamedContainer, assertProbeIdentity, SERVER_IDENTITY_SQL } from './scripts/test/assert-cardon-it-database.mjs';
      const href = readTestDatabaseUrl(process.env);
      parseCardonItUrl(href);
      const factory = await createExplicitPrismaFactory();
      const client = factory({ datasources: { db: { url: href } } });
      const rows = await client.$queryRawUnsafe(SERVER_IDENTITY_SQL);
      const container = inspectNamedContainer();
      const identity = assertProbeIdentity(rows, container.containerIp);
      await client.$disconnect();
      console.log(JSON.stringify({ database: identity.database, addr: identity.addr, containerIp: container.containerIp }));
    `,
    ],
    { encoding: 'utf8' },
  );
  const output = `${probe.stdout ?? ''}\n${probe.stderr ?? ''}`;
  if (probe.status !== 0 || /postgresql:\/\//i.test(output)) {
    throw new Error('Isolated database probe failed');
  }
  const parsed = JSON.parse(probe.stdout.trim()) as {
    database: string;
    addr: string;
    containerIp: string;
  };
  if (
    parsed.database !== 'cardon_it' ||
    parsed.addr.replace(/\/\d+$/, '') !== parsed.containerIp.replace(/\/\d+$/, '')
  ) {
    throw new Error('Database probe does not match the isolated test container');
  }
  return { addr: parsed.addr };
}

async function countsForUser(client: PrismaClient, userId: string, since: Date) {
  const [orders, payments, providerTx, attempts, quotes, orphanFinancial] = await Promise.all([
    client.order.count({ where: { userId, deletedAt: null } }),
    client.payment.count({ where: { order: { userId } } }),
    client.providerTransaction.count({ where: { order: { userId } } }),
    client.esimProviderAttempt.count({
      where: { orderItem: { order: { userId } } },
    }),
    client.esimOrderQuote.count({
      where: { orderItem: { order: { userId } } },
    }),
    // Financial rows created in this window with no order (would indicate a partial commit).
    client.financialTransaction.count({
      where: { createdAt: { gte: since }, orders: { none: {} } },
    }),
  ]);
  const orderIds = (
    await client.order.findMany({
      where: { userId, deletedAt: null },
      select: { transactionId: true },
    })
  )
    .map((row) => row.transactionId)
    .filter((id): id is string => Boolean(id));
  const financial = orderIds.length
    ? await client.financialTransaction.count({ where: { id: { in: orderIds } } })
    : 0;
  return { orders, financial, payments, providerTx, attempts, quotes, orphanFinancial };
}

describe('C3 eSIM charge limit zero-row (PostgreSQL)', () => {
  let client: PrismaClient;

  beforeAll(async () => {
    const expected = assertIsolatedProbe();
    const href = isolatedDatabaseUrl();
    client = new (PrismaClient as unknown as new (options: {
      datasources: { db: { url: string } };
    }) => PrismaClient)({
      datasources: { db: { url: href } },
    });
    const rows = await client.$queryRawUnsafe<Array<{ addr: string; database: string }>>(
      IDENTITY_SQL,
    );
    const addr = String(rows[0]?.addr ?? '').replace(/\/\d+$/, '');
    if (rows[0]?.database !== 'cardon_it' || addr !== expected.addr.replace(/\/\d+$/, '')) {
      throw new Error('Test connection does not match the isolated test container');
    }
  }, 30000);

  afterAll(async () => {
    await client?.$disconnect();
  });

  async function seedCatalog(suffix: string, sellVnd: string) {
    const slug = (name: string) => `${MARKER}-${name}-${suffix}`.slice(0, 64);
    const category = await client.productCategory.create({
      data: {
        slug: slug('cat'),
        name: `PhaseA C3 ${suffix}`,
        homeService: HomeServiceType.ESIM,
      },
    });
    const product = await client.product.create({
      data: {
        slug: slug('product'),
        name: `PhaseA C3 product ${suffix}`,
        homeService: HomeServiceType.ESIM,
        categoryId: category.id,
      },
    });
    const variant = await client.productVariant.create({
      data: {
        productId: product.id,
        sku: slug('sku'),
        name: `PhaseA C3 variant ${suffix}`,
        type: ProductVariantType.ESIM,
        faceValue: sellVnd,
        sellPrice: sellVnd,
      },
    });
    const provider =
      (await client.provider.findFirst({
        where: { code: 'AIRALO', deletedAt: null },
      })) ??
      (await client.provider.create({
        data: {
          code: 'AIRALO',
          name: 'Airalo IT',
          apiCredentials: 'it-not-a-secret',
          status: 'ACTIVE',
        },
      }));
    await client.providerProductMapping.create({
      data: {
        providerId: provider.id,
        productVariantId: variant.id,
        providerProductCode: slug('pkg'),
        providerCost: '90000',
        status: 'ACTIVE',
        availability: 'AVAILABLE',
        priority: 1,
      },
    });
    return { variant, provider };
  }

  async function seedUser(suffix: string, createdAt: Date) {
    const email = `${MARKER}-${suffix}@it.cardon.invalid`;
    return client.user.create({
      data: {
        email,
        passwordHash: createHash('sha256').update(`it-${suffix}`).digest('hex'),
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        createdAt,
      },
    });
  }

  function buildService(input: {
    maxVnd: number;
    maxUsd: number;
    sellVnd: string;
    gateway: 'SEPAY' | 'PAYPAL';
  }) {
    const orderRepository = new OrderRepository(client as never);
    const variantRepository = new VariantRepository(client as never);
    return new EsimOrderService(
      client as never,
      orderRepository,
      variantRepository,
      { getCustomerPrice: async () => input.sellVnd } as never,
      { listForVariant: jest.fn() } as never,
      {
        resolveSystemConfig: () => ({
          customerEsimEnabled: true,
          esimMaxChargeAmountVnd: input.maxVnd,
          esimMaxChargeAmountUsd: input.maxUsd,
        }),
        getPublicPaymentMethods: () => [],
        resolvePaymentMethod: () =>
          input.gateway === 'PAYPAL'
            ? {
                methodCode: 'PAYPAL',
                displayName: 'PayPal',
                gatewayCode: 'PAYPAL',
                settlementType: 'GATEWAY_SETTLEMENT',
                percentageFee: 0,
                fixedFee: 0,
              }
            : {
                methodCode: 'SEPAY',
                displayName: 'SePay',
                gatewayCode: 'SEPAY',
                settlementType: 'BANK_TRANSFER',
                percentageFee: 0,
                fixedFee: 0,
              },
        resolveEsimPaymentMethod: () =>
          input.gateway === 'PAYPAL'
            ? {
                methodCode: 'PAYPAL',
                displayName: 'PayPal',
                gatewayCode: 'PAYPAL',
                settlementType: 'GATEWAY_SETTLEMENT',
                percentageFee: 0,
                fixedFee: 0,
              }
            : {
                methodCode: 'SEPAY',
                displayName: 'SePay',
                gatewayCode: 'SEPAY',
                settlementType: 'BANK_TRANSFER',
                percentageFee: 0,
                fixedFee: 0,
              },
        listEsimMegapayMethodCodes: () => [],
        resolvePaypalConfig: () => ({
          esimEnabled: true,
          mode: 'sandbox',
          clientId: 'client',
          clientSecret: 'secret',
          webhookId: 'wh',
        }),
        resolveSepayPaymentGateway: () => ({
          enabled: true,
          merchantId: 'm',
          merchantSecretKey: 's',
        }),
      } as never,
      {
        get: (key: string) =>
          (
            {
              'esim.enabled': true,
              'esim.providerMode': 'mock',
              'esim.liveArm': false,
            } as Record<string, boolean | string>
          )[key],
      } as never,
    );
  }

  it('blocks SePay VND over limit with zero new rows for that user', async () => {
    const suffix = randomBytes(3).toString('hex');
    const user = await seedUser(`${suffix}-vnd`, new Date(Date.now() - 100 * 3_600_000));
    const { variant } = await seedCatalog(`${suffix}-vnd`, '100000');
    const since = new Date(Date.now() - 1000);
    const before = await countsForUser(client, user.id, since);
    const service = buildService({
      maxVnd: 50_000,
      maxUsd: 80,
      sellVnd: '100000',
      gateway: 'SEPAY',
    });

    let err: unknown;
    try {
      await service.create(
        {
          items: [{ variantId: variant.id, quantity: 1 }],
          paymentMethodCode: 'SEPAY',
          market: 'VN',
        } as never,
        { id: user.id, email: user.email, role: UserRole.CUSTOMER } as never,
        { countryCode: 'VN' },
      );
    } catch (caught) {
      err = caught;
    }

    expect(err).toBeInstanceOf(AppHttpException);
    expect(err).toMatchObject({
      code: ErrorCode.ESIM_ORDER_AMOUNT_LIMIT,
      message: ESIM_ORDER_AMOUNT_LIMIT_MESSAGE,
    });

    const after = await countsForUser(client, user.id, since);
    expect(after).toEqual(before);
    expect(after.orders).toBe(0);
    expect(after.financial).toBe(0);
    expect(after.orphanFinancial).toBe(0);
    expect(after.payments).toBe(0);
    expect(after.providerTx).toBe(0);
    expect(after.attempts).toBe(0);
    expect(after.quotes).toBe(0);
  });

  it('blocks PayPal USD over limit with zero new rows for that user', async () => {
    const suffix = randomBytes(3).toString('hex');
    // Mature account so overall hard cap (not new-account 30) is the binding ceiling under test.
    const user = await seedUser(`${suffix}-usd`, new Date(Date.now() - 100 * 3_600_000));
    // 2_100_000 VND / 25_000 = 84.00 USD > 80 hard cap.
    const { variant } = await seedCatalog(`${suffix}-usd`, '2100000');
    await client.fxRateSource.upsert({
      where: { code: MANUAL_USD_VND_SOURCE },
      create: {
        code: MANUAL_USD_VND_SOURCE,
        status: 'APPROVED',
        baseCurrency: 'USD',
        quoteCurrency: 'VND',
        maxStalenessSeconds: 86_400,
      },
      update: {
        status: 'APPROVED',
        maxStalenessSeconds: 86_400,
        baseCurrency: 'USD',
        quoteCurrency: 'VND',
      },
    });
    // Close any prior EFFECTIVE rows to avoid FX_CONFLICT, then publish one live rate.
    await client.fxRate.updateMany({
      where: { sourceCode: MANUAL_USD_VND_SOURCE, status: 'EFFECTIVE', effectiveTo: null },
      data: { effectiveTo: new Date() },
    });
    await client.fxRate.create({
      data: {
        sourceCode: MANUAL_USD_VND_SOURCE,
        rate: '25000',
        status: 'EFFECTIVE',
        observedAt: new Date(),
        effectiveFrom: new Date(Date.now() - 60_000),
        effectiveTo: null,
      },
    });

    const since = new Date(Date.now() - 1000);
    const before = await countsForUser(client, user.id, since);
    const service = buildService({
      maxVnd: 2_000_000,
      maxUsd: 80,
      sellVnd: '2100000',
      gateway: 'PAYPAL',
    });

    let err: unknown;
    try {
      await service.create(
        {
          items: [{ variantId: variant.id, quantity: 1 }],
          paymentMethodCode: 'PAYPAL',
          market: 'INTL',
        } as never,
        { id: user.id, email: user.email, role: UserRole.CUSTOMER } as never,
        { countryCode: 'KR' },
      );
    } catch (caught) {
      err = caught;
    }

    expect(err).toBeInstanceOf(AppHttpException);
    expect(err).toMatchObject({
      code: ErrorCode.ESIM_ORDER_AMOUNT_LIMIT,
      message: ESIM_ORDER_AMOUNT_LIMIT_MESSAGE,
    });

    const after = await countsForUser(client, user.id, since);
    expect(after).toEqual(before);
    expect(after.orders).toBe(0);
    expect(after.financial).toBe(0);
    expect(after.orphanFinancial).toBe(0);
    expect(after.payments).toBe(0);
    expect(after.providerTx).toBe(0);
    expect(after.attempts).toBe(0);
    expect(after.quotes).toBe(0);
  });
});
