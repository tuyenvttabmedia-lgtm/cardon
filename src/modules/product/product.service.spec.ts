import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CatalogProductStatus, HomeServiceType, ProductVariantType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PricingService } from './services/pricing.service';
import { ProductService } from './services/product.service';
import { ProviderMappingService } from './services/provider-mapping.service';
import { VariantService } from './services/variant.service';

describe('ProductService', () => {
  let service: ProductService;
  let productRepository: {
    create: jest.Mock;
    findBySlug: jest.Mock;
    findManyActive: jest.Mock;
    findActiveById: jest.Mock;
    softDelete: jest.Mock;
    findById: jest.Mock;
  };
  let categoryRepository: { findById: jest.Mock };

  beforeEach(() => {
    productRepository = {
      create: jest.fn(),
      findBySlug: jest.fn(),
      findManyActive: jest.fn(),
      findActiveById: jest.fn(),
      softDelete: jest.fn(),
      findById: jest.fn(),
    };
    categoryRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'cat-1',
        slug: 'game-card',
        name: 'Game Card',
        homeService: HomeServiceType.GAME_CARD,
      }),
    };
    const usage = {
      productHasUsage: jest.fn().mockResolvedValue(false),
      variantHasUsage: jest.fn().mockResolvedValue(false),
      categoryProductCount: jest.fn().mockResolvedValue(0),
      categoryHasUsage: jest.fn().mockResolvedValue(false),
    };
    service = new ProductService(
      productRepository as never,
      categoryRepository as never,
      usage as never,
    );
  });

  it('creates product', async () => {
    categoryRepository.findById.mockResolvedValue({ id: 'cat-1' });
    productRepository.findBySlug.mockResolvedValue(null);
    productRepository.create.mockResolvedValue({
      id: 'prod-1',
      categoryId: 'cat-1',
      homeService: HomeServiceType.GAME_CARD,
      slug: 'garena',
      name: 'Garena',
      description: null,
      status: CatalogProductStatus.ACTIVE,
    });

    const result = await service.createProduct({
      categoryId: 'cat-1',
      slug: 'garena',
      name: 'Garena',
    });

    expect(result.slug).toBe('garena');
    expect(productRepository.create).toHaveBeenCalled();
  });

  it('hides inactive products from public list', async () => {
    productRepository.findManyActive.mockResolvedValue([
      {
        id: 'prod-1',
        categoryId: 'cat-1',
        homeService: HomeServiceType.GAME_CARD,
        slug: 'garena',
        name: 'Garena',
        description: null,
        status: CatalogProductStatus.ACTIVE,
        category: {
          id: 'cat-1',
          slug: 'game-card',
          name: 'Game Card',
          homeService: HomeServiceType.GAME_CARD,
        },
        variants: [],
      },
    ]);

    const products = await service.listActiveProducts();
    expect(products).toHaveLength(1);
    expect(productRepository.findManyActive).toHaveBeenCalled();
  });

  it('soft deletes product with INACTIVE + deleted_at', async () => {
    productRepository.findById.mockResolvedValue({
      id: 'prod-1',
      deletedAt: null,
    });
    productRepository.softDelete.mockResolvedValue({
      id: 'prod-1',
      categoryId: 'cat-1',
      slug: 'garena',
      name: 'Garena',
      description: null,
      status: CatalogProductStatus.INACTIVE,
    });

    const result = await service.disableProduct('prod-1');
    expect(result.status).toBe(CatalogProductStatus.INACTIVE);
    expect(productRepository.softDelete).toHaveBeenCalledWith('prod-1');
  });
});

describe('VariantService', () => {
  let service: VariantService;
  let variantRepository: {
    create: jest.Mock;
    findBySku: jest.Mock;
    findById: jest.Mock;
  };
  let productRepository: { findById: jest.Mock };
  let categoryRepository: { findById: jest.Mock };

  beforeEach(() => {
    variantRepository = {
      create: jest.fn(),
      findBySku: jest.fn(),
      findById: jest.fn(),
    };
    productRepository = { findById: jest.fn() };
    categoryRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'cat-1',
        homeService: HomeServiceType.GAME_CARD,
      }),
    };
    const usage = {
      productHasUsage: jest.fn().mockResolvedValue(false),
      variantHasUsage: jest.fn().mockResolvedValue(false),
    };
    service = new VariantService(
      variantRepository as never,
      productRepository as never,
      categoryRepository as never,
      usage as never,
    );
  });

  it('creates variant', async () => {
    productRepository.findById.mockResolvedValue({
      id: 'prod-1',
      deletedAt: null,
      categoryId: 'cat-1',
      homeService: HomeServiceType.GAME_CARD,
    });
    variantRepository.findBySku.mockResolvedValue(null);
    variantRepository.create.mockResolvedValue({
      id: 'var-1',
      productId: 'prod-1',
      sku: 'GARENA_100K',
      name: 'Garena 100k',
      type: ProductVariantType.CARD,
      faceValue: new Decimal(100000),
      sellPrice: new Decimal(98000),
      status: 'ACTIVE',
    });

    const result = await service.createVariant('prod-1', {
      sku: 'GARENA_100K',
      name: 'Garena 100k',
      type: ProductVariantType.CARD,
      faceValue: 100000,
      sellPrice: 98000,
    });

    expect(result.sku).toBe('GARENA_100K');
    expect(result.type).toBe(ProductVariantType.CARD);
  });
});

describe('ProviderMappingService', () => {
  let service: ProviderMappingService;
  let mappingRepository: { create: jest.Mock; findById: jest.Mock };
  let variantRepository: { findById: jest.Mock };
  let prisma: {
    provider: { findFirst: jest.Mock };
    providerProductMapping: { findFirst: jest.Mock };
  };

  beforeEach(() => {
    mappingRepository = { create: jest.fn(), findById: jest.fn(), update: jest.fn() };
    variantRepository = { findById: jest.fn() };
    prisma = {
      provider: { findFirst: jest.fn() },
      providerProductMapping: { findFirst: jest.fn() },
    };
    service = new ProviderMappingService(
      mappingRepository as never,
      variantRepository as never,
      prisma as never,
    );
  });

  it('maps variant to provider', async () => {
    variantRepository.findById.mockResolvedValue({
      id: 'var-1',
      deletedAt: null,
    });
    prisma.provider.findFirst.mockResolvedValue({ id: 'prov-esale' });
    prisma.providerProductMapping.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    mappingRepository.create.mockResolvedValue({
      id: 'map-1',
      providerId: 'prov-esale',
      productVariantId: 'var-1',
      providerProductCode: '123',
      providerCost: new Decimal(95000),
      priority: 0,
      status: 'ACTIVE',
      provider: { id: 'prov-esale', code: 'ESALE', name: 'eSale' },
    });

    const result = await service.createMapping('var-1', {
      providerId: 'prov-esale',
      providerProductCode: '123',
      providerCost: 95000,
    });

    expect(result.providerProductCode).toBe('123');
    expect(mappingRepository.create).toHaveBeenCalled();
  });
});

describe('PricingService', () => {
  let service: PricingService;
  let pricingRepository: {
    findActiveVariantSellPrice: jest.Mock;
    findActiveAgentProductPrice: jest.Mock;
    findAgent: jest.Mock;
  };
  let mappingRepository: { findLowestActiveCost: jest.Mock };

  beforeEach(() => {
    pricingRepository = {
      findActiveVariantSellPrice: jest.fn(),
      findActiveAgentProductPrice: jest.fn(),
      findAgent: jest.fn(),
    };
    mappingRepository = { findLowestActiveCost: jest.fn() };
    service = new PricingService(
      pricingRepository as never,
      mappingRepository as never,
    );
  });

  it('returns customer sell price', async () => {
    pricingRepository.findActiveVariantSellPrice.mockResolvedValue({
      sellPrice: new Decimal(98000),
    });

    const price = await service.getCustomerPrice('var-1');
    expect(price).toBe('98000.00');
  });

  it('prioritizes agent custom price over default', async () => {
    pricingRepository.findAgent.mockResolvedValue({ id: 'agent-1' });
    pricingRepository.findActiveAgentProductPrice.mockResolvedValue({
      agentPrice: new Decimal(90000),
    });

    const price = await service.getAgentPrice('agent-1', 'var-1');
    expect(price).toBe('90000.00');
    expect(pricingRepository.findActiveVariantSellPrice).not.toHaveBeenCalled();
  });

  it('falls back to customer price when no agent custom price', async () => {
    pricingRepository.findAgent.mockResolvedValue({ id: 'agent-1' });
    pricingRepository.findActiveAgentProductPrice.mockResolvedValue(null);
    pricingRepository.findActiveVariantSellPrice.mockResolvedValue({
      sellPrice: new Decimal(98000),
    });

    const price = await service.getAgentPrice('agent-1', 'var-1');
    expect(price).toBe('98000.00');
  });

  it('throws when variant not active for customer price', async () => {
    pricingRepository.findActiveVariantSellPrice.mockResolvedValue(null);
    await expect(service.getCustomerPrice('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects agent price below provider cost', async () => {
    mappingRepository.findLowestActiveCost.mockResolvedValue({
      providerCost: new Decimal(98000),
    });
    await expect(service.validateAgentPrice('var-1', 97000)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
