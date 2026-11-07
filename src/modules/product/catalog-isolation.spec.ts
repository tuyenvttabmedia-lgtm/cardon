import { NotFoundException } from '@nestjs/common';
import {
  CatalogProductStatus,
  HomeServiceType,
  ProductVariantStatus,
  ProductVariantType,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { AgentApiCatalogService } from '../agent-api/services/agent-api-catalog.service';
import { AgentPlatformService } from '../agent-platform/services/agent-platform.service';
import { filterPublicCatalogByHomeService } from './entities/catalog-availability';
import { assertVariantAllowedForHomeService } from './entities/home-service';
import { ACTIVE_PRODUCT_WHERE } from './entities/product.constants';
import { CategoryService } from './services/category.service';
import { ProductService } from './services/product.service';

function publicProduct(homeService: HomeServiceType, slug: string) {
  return {
    id: `prod-${slug}`,
    categoryId: 'cat-1',
    homeService,
    slug,
    name: slug,
    description: null,
    status: CatalogProductStatus.ACTIVE,
    category: {
      id: 'cat-1',
      slug: 'cat',
      name: 'Cat',
      homeService,
    },
    variants: [
      {
        id: `var-${slug}`,
        productId: `prod-${slug}`,
        sku: `${slug}-sku`,
        name: slug,
        type: homeService === HomeServiceType.ESIM ? ProductVariantType.ESIM : ProductVariantType.CARD,
        faceValue: new Decimal(100000),
        sellPrice: new Decimal(98000),
        status: 'ACTIVE',
      },
    ],
  };
}

function categoryRow(homeService: HomeServiceType, slug: string) {
  return {
    id: `cat-${slug}`,
    slug,
    name: slug,
    homeService,
    iconUrl: null,
    parentId: null,
    sortOrder: 0,
    status: 'ACTIVE',
  };
}

describe('catalog isolation', () => {
  it('keeps CARD, PHONE_CARD, TOPUP, and enabled DATA while always dropping ESIM', () => {
    const items = [
      { homeService: HomeServiceType.GAME_CARD },
      { homeService: HomeServiceType.PHONE_CARD },
      { homeService: HomeServiceType.TOPUP },
      { homeService: HomeServiceType.DATA },
      { homeService: HomeServiceType.ESIM },
    ];

    expect(filterPublicCatalogByHomeService(items, true).map((item) => item.homeService)).toEqual([
      HomeServiceType.GAME_CARD,
      HomeServiceType.PHONE_CARD,
      HomeServiceType.TOPUP,
      HomeServiceType.DATA,
    ]);
    expect(filterPublicCatalogByHomeService(items, false).map((item) => item.homeService)).toEqual([
      HomeServiceType.GAME_CARD,
      HomeServiceType.PHONE_CARD,
      HomeServiceType.TOPUP,
    ]);
  });

  it('does not change allowed variant types for card, topup, or data', () => {
    expect(() =>
      assertVariantAllowedForHomeService(HomeServiceType.GAME_CARD, ProductVariantType.CARD),
    ).not.toThrow();
    expect(() =>
      assertVariantAllowedForHomeService(HomeServiceType.PHONE_CARD, ProductVariantType.CARD),
    ).not.toThrow();
    expect(() =>
      assertVariantAllowedForHomeService(HomeServiceType.TOPUP, ProductVariantType.TOPUP),
    ).not.toThrow();
    expect(() =>
      assertVariantAllowedForHomeService(HomeServiceType.DATA, ProductVariantType.DATA),
    ).not.toThrow();
    expect(() =>
      assertVariantAllowedForHomeService(HomeServiceType.GAME_CARD, ProductVariantType.ESIM),
    ).toThrow(/not allowed/);
    expect(() =>
      assertVariantAllowedForHomeService(HomeServiceType.ESIM, ProductVariantType.ESIM),
    ).not.toThrow();
  });

  describe('public product and category APIs', () => {
    function productService(customerDataEnabled: boolean) {
      const productRepository = {
        findManyActive: jest.fn().mockResolvedValue([
          publicProduct(HomeServiceType.GAME_CARD, 'garena'),
          publicProduct(HomeServiceType.DATA, 'data-pack'),
          publicProduct(HomeServiceType.ESIM, 'esim-preview'),
        ]),
        findManyAdmin: jest.fn().mockResolvedValue([publicProduct(HomeServiceType.ESIM, 'esim-preview')]),
        findActiveById: jest.fn(),
        findActiveBySlug: jest.fn(),
      };
      const service = new ProductService(
        productRepository as never,
        {} as never,
        {} as never,
        { resolveSystemConfig: () => ({ customerDataEnabled }) } as never,
        { notifyProducts: jest.fn() } as never,
      );
      return { service, productRepository };
    }

    function categoryService() {
      const categoryRepository = {
        findManyActive: jest.fn().mockResolvedValue([
          categoryRow(HomeServiceType.GAME_CARD, 'game-card'),
          categoryRow(HomeServiceType.ESIM, 'esim-test'),
        ]),
        findManyAll: jest.fn().mockResolvedValue([
          categoryRow(HomeServiceType.GAME_CARD, 'game-card'),
          categoryRow(HomeServiceType.ESIM, 'esim-test'),
        ]),
        findBySlug: jest.fn(async (slug: string) => ({
          id: 'existing',
          slug,
          homeService:
            slug === 'phone-card'
              ? HomeServiceType.PHONE_CARD
              : slug === 'topup'
                ? HomeServiceType.TOPUP
                : slug === 'data'
                  ? HomeServiceType.DATA
                  : HomeServiceType.GAME_CARD,
        })),
      };
      const service = new CategoryService(
        categoryRepository as never,
        {} as never,
        {} as never,
        { resolveSystemConfig: () => ({ customerDataEnabled: true }) } as never,
      );
      return { service, categoryRepository };
    }

    it('GET /products omits ESIM and still returns card faceValue', async () => {
      const { service } = productService(true);
      const products = await service.listActiveProducts();
      expect(products.map((product) => product.slug)).toEqual(['garena', 'data-pack']);
      expect(products[0].variants?.[0].faceValue).toBe('100000.00');
      expect(products.some((product) => product.homeService === HomeServiceType.ESIM)).toBe(false);
    });

    it('GET /products/:id and GET /products/by-slug/:slug return 404 for ESIM', async () => {
      const { service, productRepository } = productService(true);
      productRepository.findActiveById.mockResolvedValue(publicProduct(HomeServiceType.ESIM, 'esim-preview'));
      productRepository.findActiveBySlug.mockResolvedValue(publicProduct(HomeServiceType.ESIM, 'esim-preview'));

      await expect(service.getActiveProduct('prod-esim-preview')).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.getActiveProductBySlug('esim-preview')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('GET /products/:id still returns a card product', async () => {
      const { service, productRepository } = productService(true);
      productRepository.findActiveById.mockResolvedValue(publicProduct(HomeServiceType.GAME_CARD, 'garena'));
      const product = await service.getActiveProduct('prod-garena');
      expect(product.slug).toBe('garena');
      expect(product.variants?.[0].faceValue).toBe('100000.00');
    });

    it('GET /products/categories omits ESIM and admin category list keeps it', async () => {
      const { service } = categoryService();
      const publicCategories = await service.listActiveCategories();
      const adminCategories = await service.listAllCategories();
      expect(publicCategories.map((category) => category.homeService)).toEqual([HomeServiceType.GAME_CARD]);
      expect(adminCategories.map((category) => category.homeService)).toEqual([
        HomeServiceType.GAME_CARD,
        HomeServiceType.ESIM,
      ]);
    });

    it('admin product list still returns ESIM', async () => {
      const { service } = productService(false);
      const products = await service.listAdminProducts('all');
      expect(products.map((product) => product.homeService)).toEqual([HomeServiceType.ESIM]);
    });

    it('does not create a public ESIM root category', async () => {
      const { service, categoryRepository } = categoryService();
      await service.ensureRootCategories();
      const createdServices = categoryRepository.findBySlug.mock.calls.map((call) => call[0]);
      expect(createdServices).not.toContain('esim-test');
    });
  });

  it('agent API product query excludes ESIM and still prices card SKUs', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'var-card',
        sku: 'GARENA_100',
        name: 'Garena 100',
        faceValue: new Decimal(100000),
        status: ProductVariantStatus.ACTIVE,
        product: { name: 'Garena' },
      },
    ]);
    const service = new AgentApiCatalogService(
      { productVariant: { findMany } } as never,
      {} as never,
      { resolveAgentPrice: jest.fn().mockResolvedValue({ sellingPrice: '98000.00' }) } as never,
    );

    const result = await service.listProducts('agent-1');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: ProductVariantStatus.ACTIVE,
          product: {
            ...ACTIVE_PRODUCT_WHERE,
            homeService: { not: HomeServiceType.ESIM },
          },
        }),
      }),
    );
    expect(result.items).toEqual([
      expect.objectContaining({
        product_code: 'GARENA_100',
        face_value: '100000.00',
        agent_price: '98000.00',
      }),
    ]);
  });

  it('partner portal product query excludes ESIM without changing card status filters', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new AgentPlatformService(
      { productVariant: { findMany } } as never,
      { findById: jest.fn().mockResolvedValue({ id: 'agent-1' }) } as never,
      {} as never,
      {} as never,
      {} as never,
      {
        resolve: jest.fn().mockResolvedValue({ agentId: 'agent-1' }),
        assertPermission: jest.fn(),
      } as never,
      {} as never,
      { resolveAgentPrice: jest.fn() } as never,
    );

    await service.listProducts('user-1');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          status: ProductVariantStatus.ACTIVE,
          product: { homeService: { not: HomeServiceType.ESIM } },
        },
      }),
    );
  });
});
