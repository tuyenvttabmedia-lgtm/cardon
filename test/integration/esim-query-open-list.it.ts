import { spawnSync } from 'child_process';
import { randomBytes, randomUUID } from 'crypto';
import {
  EsimAttemptOperation,
  EsimAttemptOutcome,
  EsimProviderMode,
  FulfillmentStatus,
  HomeServiceType,
  OrderChannel,
  OrderPaymentStatus,
  PrismaClient,
  ProductVariantType,
} from '@prisma/client';
import { EsimFulfillmentRepository } from '../../src/modules/esim/esim-fulfillment.repository';

const MARKER = 'k19-bsql';
const ROLLBACK = 'k19-rollback';
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
    ['--input-type=module', '--eval', `
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
    `],
    { encoding: 'utf8' },
  );
  const output = `${probe.stdout ?? ''}\n${probe.stderr ?? ''}`;
  if (probe.status !== 0 || /postgresql:\/\//i.test(output)) {
    throw new Error('Isolated database probe failed');
  }
  const parsed = JSON.parse(probe.stdout.trim()) as { database: string; addr: string; containerIp: string };
  if (parsed.database !== 'cardon_it' || parsed.addr.replace(/\/\d+$/, '') !== parsed.containerIp.replace(/\/\d+$/, '')) {
    throw new Error('Database probe does not match the isolated test container');
  }
  return { addr: parsed.addr };
}

async function rolledBack(
  client: PrismaClient,
  run: (tx: PrismaClient) => Promise<void>,
): Promise<void> {
  try {
    await client.$transaction(async (tx) => {
      await run(tx as unknown as PrismaClient);
      throw new Error(ROLLBACK);
    });
  } catch (error) {
    if (error instanceof Error && error.message === ROLLBACK) {
      return;
    }
    throw error;
  }
}

async function catalog(tx: PrismaClient, suffix: string) {
  const slug = (name: string) => `${MARKER}-${name}-${suffix}`;
  const category = await tx.productCategory.create({
    data: { slug: slug('cat'), name: `K19 ${suffix}`, homeService: HomeServiceType.ESIM },
  });
  const product = await tx.product.create({
    data: {
      slug: slug('product'),
      name: `K19 product ${suffix}`,
      homeService: HomeServiceType.ESIM,
      categoryId: category.id,
    },
  });
  const variant = await tx.productVariant.create({
    data: {
      productId: product.id,
      sku: slug('sku'),
      name: `K19 variant ${suffix}`,
      type: ProductVariantType.ESIM,
      faceValue: '10000',
      sellPrice: '10000',
    },
  });
  const provider = await tx.provider.create({
    data: {
      code: slug('prov').slice(0, 64),
      name: `K19 provider ${suffix}`,
      apiCredentials: 'k19-test-not-secret',
    },
  });
  return { variant, provider };
}

async function seedCreate(
  tx: PrismaClient,
  input: {
    catalog: Awaited<ReturnType<typeof catalog>>;
    suffix: string;
    index: number;
    createdAt: Date;
    locked?: boolean;
    closedQuery?: boolean;
    mismatchedQueryGuard?: boolean;
    extraItemQuery?: boolean;
    mockMode?: boolean;
    hasProfile?: boolean;
    fulfillmentStatus?: FulfillmentStatus;
    providerReference?: string | null;
  },
) {
  const order = await tx.order.create({
    data: {
      orderCode: `${MARKER}-${input.suffix}-${input.index}`,
      channel: OrderChannel.B2C,
      isGuestOrder: true,
      guestEmail: `k19-${input.suffix}-${input.index}@example.test`,
      totalAmount: '10000',
      paymentStatus: OrderPaymentStatus.PAID,
      fulfillmentStatus: input.fulfillmentStatus ?? FulfillmentStatus.PROCESSING,
    },
  });
  const item = await tx.orderItem.create({
    data: {
      orderId: order.id,
      variantId: input.catalog.variant.id,
      quantity: 1,
      unitPrice: '10000',
      totalAmount: '10000',
    },
  });
  const quote = await tx.esimOrderQuote.create({
    data: {
      orderItemId: item.id,
      providerId: input.catalog.provider.id,
      providerProductCode: 'k19-pkg',
      providerCost: '1000',
      providerMode: input.mockMode ? EsimProviderMode.MOCK : EsimProviderMode.LIVE,
    },
  });
  const create = await tx.esimProviderAttempt.create({
    data: {
      orderItemId: item.id,
      quoteId: quote.id,
      requestId: `k19-create-${input.suffix}-${input.index}`,
      providerReference: input.providerReference === undefined ? `ref-${input.index}` : input.providerReference,
      operation: EsimAttemptOperation.CREATE,
      outcome: EsimAttemptOutcome.SENT,
      openGuard: item.id,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    },
  });
  if (input.locked) {
    await tx.esimProviderAttempt.create({
      data: {
        orderItemId: item.id,
        quoteId: quote.id,
        requestId: `k19-query-${input.suffix}-${input.index}`,
        providerReference: `ref-${input.index}`,
        operation: EsimAttemptOperation.QUERY,
        outcome: EsimAttemptOutcome.SENT,
        openGuard: create.id,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      },
    });
  }
  if (input.closedQuery) {
    await tx.esimProviderAttempt.create({
      data: {
        orderItemId: item.id,
        quoteId: quote.id,
        requestId: `k19-closed-${input.suffix}-${input.index}`,
        providerReference: `ref-${input.index}`,
        operation: EsimAttemptOperation.QUERY,
        outcome: EsimAttemptOutcome.UNCONFIRMED,
        openGuard: null,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      },
    });
  }
  if (input.mismatchedQueryGuard) {
    let mismatchedGuard = randomUUID();
    while (mismatchedGuard === item.id || mismatchedGuard === create.id) {
      mismatchedGuard = randomUUID();
    }
    await tx.esimProviderAttempt.create({
      data: {
        orderItemId: item.id,
        quoteId: quote.id,
        requestId: `k19-mismatch-${input.suffix}-${input.index}`,
        providerReference: `ref-${input.index}`,
        operation: EsimAttemptOperation.QUERY,
        outcome: EsimAttemptOutcome.SENT,
        openGuard: mismatchedGuard,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      },
    });
  }
  if (input.extraItemQuery) {
    const other = await tx.orderItem.create({
      data: {
        orderId: order.id,
        variantId: input.catalog.variant.id,
        quantity: 1,
        unitPrice: '10000',
        totalAmount: '10000',
      },
    });
    const otherQuote = await tx.esimOrderQuote.create({
      data: {
        orderItemId: other.id,
        providerId: input.catalog.provider.id,
        providerProductCode: 'k19-other',
        providerCost: '1000',
        providerMode: EsimProviderMode.LIVE,
      },
    });
    await tx.esimProviderAttempt.create({
      data: {
        orderItemId: other.id,
        quoteId: otherQuote.id,
        requestId: `k19-otherq-${input.suffix}-${input.index}`,
        providerReference: `ref-other-${input.index}`,
        operation: EsimAttemptOperation.QUERY,
        outcome: EsimAttemptOutcome.SENT,
        openGuard: create.id,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      },
    });
  }
  if (input.hasProfile) {
    await tx.esimProfile.create({
      data: {
        orderItemId: item.id,
        attemptId: create.id,
        installSecretEnc: 'k19-enc-not-secret',
      },
    });
  }
  return { order, item, create };
}

describe('LPA-16K19 listQueryOpenRecoveryOrderIds B-SQL', () => {
  let client: PrismaClient;

  beforeAll(async () => {
    const expected = assertIsolatedProbe();
    const href = isolatedDatabaseUrl();
    client = new (PrismaClient as unknown as new (options: { datasources: { db: { url: string } } }) => PrismaClient)({
      datasources: { db: { url: href } },
    });
    const rows = await client.$queryRawUnsafe<Array<{ addr: string; database: string }>>(IDENTITY_SQL);
    const addr = String(rows[0]?.addr ?? '').replace(/\/\d+$/, '');
    if (rows[0]?.database !== 'cardon_it' || addr !== expected.addr.replace(/\/\d+$/, '')) {
      throw new Error('Test connection does not match the isolated test container');
    }
  }, 20000);

  afterAll(async () => {
    await client?.$disconnect();
  });

  it('1. starvation: 20 locked older rows do not hide an unlocked candidate', async () => {
    const suffix = randomBytes(3).toString('hex');
    await rolledBack(client, async (tx) => {
      const shared = await catalog(tx, suffix);
      const base = new Date('2026-01-01T00:00:00.000Z');
      for (let index = 0; index < 20; index += 1) {
        await seedCreate(tx, {
          catalog: shared,
          suffix,
          index,
          createdAt: new Date(base.getTime() + index * 1000),
          locked: true,
        });
      }
      const unlocked = await seedCreate(tx, {
        catalog: shared,
        suffix,
        index: 20,
        createdAt: new Date(base.getTime() + 20_000),
      });
      const repo = new EsimFulfillmentRepository(tx as never);
      const ids = await repo.listQueryOpenRecoveryOrderIds(20);
      expect(ids).toEqual([unlocked.order.id]);
    });
  });

  it('2. mixed candidates: locked rows are skipped and unlocked fill take', async () => {
    const suffix = randomBytes(3).toString('hex');
    await rolledBack(client, async (tx) => {
      const shared = await catalog(tx, suffix);
      const base = new Date('2026-01-02T00:00:00.000Z');
      const unlocked: string[] = [];
      for (let index = 0; index < 6; index += 1) {
        const row = await seedCreate(tx, {
          catalog: shared,
          suffix,
          index,
          createdAt: new Date(base.getTime() + index * 1000),
          locked: index % 2 === 0,
        });
        if (index % 2 !== 0) unlocked.push(row.order.id);
      }
      const repo = new EsimFulfillmentRepository(tx as never);
      const ids = await repo.listQueryOpenRecoveryOrderIds(20);
      expect(ids).toEqual(unlocked);
    });
  });

  it('3. closed QUERY does not exclude the CREATE candidate', async () => {
    const suffix = randomBytes(3).toString('hex');
    await rolledBack(client, async (tx) => {
      const shared = await catalog(tx, suffix);
      const row = await seedCreate(tx, {
        catalog: shared,
        suffix,
        index: 0,
        createdAt: new Date('2026-01-03T00:00:00.000Z'),
        closedQuery: true,
      });
      const repo = new EsimFulfillmentRepository(tx as never);
      expect(await repo.listQueryOpenRecoveryOrderIds()).toEqual([row.order.id]);
    });
  });

  it('4. QUERY openGuard that does not point at the CREATE id is ignored', async () => {
    const suffix = randomBytes(3).toString('hex');
    await rolledBack(client, async (tx) => {
      const shared = await catalog(tx, suffix);
      const row = await seedCreate(tx, {
        catalog: shared,
        suffix,
        index: 0,
        createdAt: new Date('2026-01-04T00:00:00.000Z'),
        mismatchedQueryGuard: true,
      });
      const query = await tx.esimProviderAttempt.findFirstOrThrow({
        where: { orderItemId: row.item.id, operation: EsimAttemptOperation.QUERY },
      });
      expect(query.openGuard).not.toBe(row.create.id);
      expect(query.openGuard).not.toBe(row.item.id);
      const repo = new EsimFulfillmentRepository(tx as never);
      expect(await repo.listQueryOpenRecoveryOrderIds()).toEqual([row.order.id]);
    });
  });

  it('5. QUERY on another order item does not exclude this CREATE', async () => {
    const suffix = randomBytes(3).toString('hex');
    await rolledBack(client, async (tx) => {
      const shared = await catalog(tx, suffix);
      const row = await seedCreate(tx, {
        catalog: shared,
        suffix,
        index: 0,
        createdAt: new Date('2026-01-05T00:00:00.000Z'),
        extraItemQuery: true,
      });
      const repo = new EsimFulfillmentRepository(tx as never);
      expect(await repo.listQueryOpenRecoveryOrderIds()).toEqual([row.order.id]);
    });
  });

  it('6. empty result when no candidate is eligible', async () => {
    const suffix = randomBytes(3).toString('hex');
    await rolledBack(client, async (tx) => {
      const shared = await catalog(tx, suffix);
      await seedCreate(tx, {
        catalog: shared,
        suffix,
        index: 0,
        createdAt: new Date('2026-01-06T00:00:00.000Z'),
        mockMode: true,
      });
      await seedCreate(tx, {
        catalog: shared,
        suffix,
        index: 1,
        createdAt: new Date('2026-01-06T00:00:01.000Z'),
        hasProfile: true,
      });
      await seedCreate(tx, {
        catalog: shared,
        suffix,
        index: 2,
        createdAt: new Date('2026-01-06T00:00:02.000Z'),
        fulfillmentStatus: FulfillmentStatus.COMPLETED,
      });
      const repo = new EsimFulfillmentRepository(tx as never);
      expect(await repo.listQueryOpenRecoveryOrderIds()).toEqual([]);
    });
  });

  it('7. stable order uses id ASC when createdAt ties', async () => {
    const suffix = randomBytes(3).toString('hex');
    await rolledBack(client, async (tx) => {
      const shared = await catalog(tx, suffix);
      const createdAt = new Date('2026-01-07T00:00:00.000Z');
      const first = await seedCreate(tx, { catalog: shared, suffix, index: 0, createdAt });
      const second = await seedCreate(tx, { catalog: shared, suffix, index: 1, createdAt });
      const expected = [first, second]
        .sort((left, right) => left.create.id.localeCompare(right.create.id))
        .map((row) => row.order.id);
      const repo = new EsimFulfillmentRepository(tx as never);
      expect(await repo.listQueryOpenRecoveryOrderIds()).toEqual(expected);
    });
  });

  it('8. list is read-only and does not mutate guard, reference, QUERY, or status', async () => {
    const suffix = randomBytes(3).toString('hex');
    await rolledBack(client, async (tx) => {
      const shared = await catalog(tx, suffix);
      const createdAt = new Date('2026-01-08T00:00:00.000Z');
      const unlocked = await seedCreate(tx, { catalog: shared, suffix, index: 0, createdAt });
      const locked = await seedCreate(tx, {
        catalog: shared,
        suffix,
        index: 1,
        createdAt: new Date(createdAt.getTime() + 1000),
        locked: true,
      });
      const before = await tx.esimProviderAttempt.findMany({
        where: { orderItemId: { in: [unlocked.item.id, locked.item.id] } },
        orderBy: { requestId: 'asc' },
      });
      const beforeOrders = await tx.order.findMany({
        where: { id: { in: [unlocked.order.id, locked.order.id] } },
        select: { id: true, fulfillmentStatus: true },
        orderBy: { orderCode: 'asc' },
      });
      const repo = new EsimFulfillmentRepository(tx as never);
      expect(await repo.listQueryOpenRecoveryOrderIds()).toEqual([unlocked.order.id]);
      const after = await tx.esimProviderAttempt.findMany({
        where: { orderItemId: { in: [unlocked.item.id, locked.item.id] } },
        orderBy: { requestId: 'asc' },
      });
      const afterOrders = await tx.order.findMany({
        where: { id: { in: [unlocked.order.id, locked.order.id] } },
        select: { id: true, fulfillmentStatus: true },
        orderBy: { orderCode: 'asc' },
      });
      expect(after).toEqual(before);
      expect(afterOrders).toEqual(beforeOrders);
      expect(locked.create.openGuard).toBe(locked.item.id);
      expect(locked.create.providerReference).toBe('ref-1');
    });
  });

  it('9. take is clamped to 1..20', async () => {
    const suffix = randomBytes(3).toString('hex');
    await rolledBack(client, async (tx) => {
      const shared = await catalog(tx, suffix);
      const base = new Date('2026-01-09T00:00:00.000Z');
      const created: string[] = [];
      for (let index = 0; index < 25; index += 1) {
        const row = await seedCreate(tx, {
          catalog: shared,
          suffix,
          index,
          createdAt: new Date(base.getTime() + index * 1000),
        });
        created.push(row.order.id);
      }
      const repo = new EsimFulfillmentRepository(tx as never);
      expect(await repo.listQueryOpenRecoveryOrderIds(100)).toEqual(created.slice(0, 20));
      expect(await repo.listQueryOpenRecoveryOrderIds(0)).toEqual(created.slice(0, 1));
    });
  });
});
