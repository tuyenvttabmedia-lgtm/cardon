import { BadRequestException } from '@nestjs/common';
import { spawnSync } from 'child_process';
import { randomBytes } from 'crypto';
import { CatalogProductStatus, HomeServiceType, PrismaClient } from '@prisma/client';
import { CategoryRepository } from '../../src/modules/product/repositories/category.repository';
import { ProductRepository } from '../../src/modules/product/repositories/product.repository';
import { CategoryService } from '../../src/modules/product/services/category.service';
import { ProductService } from '../../src/modules/product/services/product.service';

const MARKER = 'b328-gate';

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

function services(tx: unknown, customerDataEnabled: boolean) {
  const products = new ProductRepository(tx as never);
  const categories = new CategoryRepository(tx as never);
  const settings = { resolveSystemConfig: () => ({ customerDataEnabled }) };
  const productsService = new ProductService(
    products,
    categories,
    { productHasUsage: async () => false } as unknown as ConstructorParameters<typeof ProductService>[2],
    settings as unknown as ConstructorParameters<typeof ProductService>[3],
    { notifyProducts: async () => undefined } as unknown as ConstructorParameters<typeof ProductService>[4],
  );
  const categoriesService = new CategoryService(
    categories,
    products,
    { categoryProductCount: async () => 0 } as unknown as ConstructorParameters<typeof CategoryService>[2],
    settings as unknown as ConstructorParameters<typeof CategoryService>[3],
  );
  return { productsService, categoriesService };
}

describe('Gate B2.2 catalog guard', () => {
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

  it('hides eSIM, keeps card groups, and rejects a cross-service product move', async () => {
    const suffix = randomBytes(3).toString('hex');
    const slug = (name: string) => `${MARKER}-${name}-${suffix}`;
    const beforeProducts = await client.product.count();
    const beforeCategories = await client.productCategory.count();
    const existing = await client.product.findMany({
      where: { status: CatalogProductStatus.ACTIVE, deletedAt: null },
      select: { id: true, homeService: true },
    });

    let rolledBack = false;
    try {
      await client.$transaction(async (tx) => {
        const game = await tx.productCategory.create({
          data: { slug: slug('game'), name: `B328 game ${suffix}`, homeService: HomeServiceType.GAME_CARD },
        });
        const gameSibling = await tx.productCategory.create({
          data: { slug: slug('game-sibling'), name: `B328 game sibling ${suffix}`, homeService: HomeServiceType.GAME_CARD },
        });
        const phone = await tx.productCategory.create({
          data: { slug: slug('phone'), name: `B328 phone ${suffix}`, homeService: HomeServiceType.PHONE_CARD },
        });
        const topup = await tx.productCategory.create({
          data: { slug: slug('topup'), name: `B328 topup ${suffix}`, homeService: HomeServiceType.TOPUP },
        });
        const data = await tx.productCategory.create({
          data: { slug: slug('data'), name: `B328 data ${suffix}`, homeService: HomeServiceType.DATA },
        });
        const esim = await tx.productCategory.create({
          data: { slug: slug('esim'), name: `B328 esim ${suffix}`, homeService: HomeServiceType.ESIM },
        });
        const gameProduct = await tx.product.create({
          data: {
            slug: slug('game-product'),
            name: `B328 game product ${suffix}`,
            homeService: HomeServiceType.GAME_CARD,
            categoryId: game.id,
          },
        });
        await tx.productVariant.create({
          data: {
            productId: gameProduct.id,
            sku: slug('sku'),
            name: `B328 variant ${suffix}`,
            type: 'CARD',
            faceValue: '10000',
            sellPrice: '10000',
          },
        });
        await tx.product.create({
          data: {
            slug: slug('inactive-game'),
            name: `B328 inactive ${suffix}`,
            homeService: HomeServiceType.GAME_CARD,
            categoryId: game.id,
            status: CatalogProductStatus.INACTIVE,
          },
        });
        await tx.product.create({
          data: {
            slug: slug('phone-product'),
            name: `B328 phone product ${suffix}`,
            homeService: HomeServiceType.PHONE_CARD,
            categoryId: phone.id,
          },
        });
        await tx.product.create({
          data: {
            slug: slug('topup-product'),
            name: `B328 topup product ${suffix}`,
            homeService: HomeServiceType.TOPUP,
            categoryId: topup.id,
          },
        });
        await tx.product.create({
          data: {
            slug: slug('data-product'),
            name: `B328 data product ${suffix}`,
            homeService: HomeServiceType.DATA,
            categoryId: data.id,
          },
        });
        await tx.product.create({
          data: {
            slug: slug('esim-product'),
            name: `B328 esim product ${suffix}`,
            homeService: HomeServiceType.ESIM,
            categoryId: esim.id,
          },
        });

        const hidden = services(tx, false);
        const shown = services(tx, true);
        const publicOff = await hidden.productsService.listActiveProducts();
        const publicOn = await shown.productsService.listActiveProducts();
        const categoriesOff = await hidden.categoriesService.listActiveCategories();
        const admin = await hidden.productsService.listAdminProducts('active');

        const publicOffSlugs = publicOff.map((row) => row.slug);
        const publicOnSlugs = publicOn.map((row) => row.slug);
        expect(publicOffSlugs).not.toContain(slug('esim-product'));
        expect(publicOnSlugs).not.toContain(slug('esim-product'));
        expect(publicOffSlugs).toEqual(expect.arrayContaining([
          slug('game-product'),
          slug('phone-product'),
          slug('topup-product'),
        ]));
        expect(publicOffSlugs).not.toContain(slug('data-product'));
        expect(publicOffSlugs).not.toContain(slug('inactive-game'));
        expect(publicOnSlugs).toContain(slug('data-product'));
        expect(publicOff.find((row) => row.slug === slug('game-product'))?.variants).toEqual([
          expect.objectContaining({ sku: slug('sku'), type: 'CARD', faceValue: '10000.00' }),
        ]);

        const categorySlugsOff = categoriesOff.map((row) => row.slug);
        expect(categorySlugsOff).not.toContain(slug('esim'));
        expect(categorySlugsOff).toEqual(expect.arrayContaining([
          slug('game'),
          slug('phone'),
          slug('topup'),
        ]));
        expect(categorySlugsOff).not.toContain(slug('data'));
        const categorySlugsOn = (await shown.categoriesService.listActiveCategories()).map((row) => row.slug);
        expect(categorySlugsOn).toContain(slug('data'));
        expect(categorySlugsOn).not.toContain(slug('esim'));

        for (const row of existing) {
          const visible = publicOff.some((item) => item.id === row.id);
          if (row.homeService === HomeServiceType.ESIM || row.homeService === HomeServiceType.DATA) {
            expect(visible).toBe(false);
          }
          if (
            row.homeService === HomeServiceType.GAME_CARD ||
            row.homeService === HomeServiceType.PHONE_CARD ||
            row.homeService === HomeServiceType.TOPUP
          ) {
            expect(visible).toBe(true);
          }
        }
        expect(admin.some((row) => row.slug === slug('esim-product'))).toBe(true);

        await expect(
          hidden.productsService.updateProduct(gameProduct.id, { categoryId: esim.id }),
        ).rejects.toThrow(BadRequestException);
        await expect(
          hidden.productsService.updateProduct(gameProduct.id, { categoryId: topup.id }),
        ).rejects.toThrow(/Cannot move product from GAME_CARD to TOPUP/);
        const unchanged = await tx.product.findUniqueOrThrow({ where: { id: gameProduct.id } });
        expect(unchanged.homeService).toBe(HomeServiceType.GAME_CARD);
        expect(unchanged.categoryId).toBe(game.id);

        const moved = await hidden.productsService.updateProduct(gameProduct.id, { categoryId: gameSibling.id });
        expect(moved.homeService).toBe(HomeServiceType.GAME_CARD);
        const sameService = await tx.product.findUniqueOrThrow({ where: { id: gameProduct.id } });
        expect(sameService.homeService).toBe(HomeServiceType.GAME_CARD);
        expect(sameService.categoryId).toBe(gameSibling.id);

        throw new Error('ROLLBACK_TEST_DATA');
      }, { timeout: 20000 });
    } catch (error) {
      if (error instanceof Error && error.message === 'ROLLBACK_TEST_DATA') rolledBack = true;
      else throw error;
    }

    expect(rolledBack).toBe(true);
    expect(await client.product.count()).toBe(beforeProducts);
    expect(await client.productCategory.count()).toBe(beforeCategories);
    expect(await client.product.count({ where: { slug: { startsWith: `${MARKER}-` } } })).toBe(0);
  }, 30000);
});
