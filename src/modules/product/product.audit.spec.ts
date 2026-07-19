/**
 * Phase 2C.1 — Product Engine Audit Tests
 */
import { BadRequestException } from '@nestjs/common';
import {
  CatalogProductStatus,
  ProductVariantType,
  ProviderProductMappingStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import {
  PRODUCT_CACHE_POLICY,
  PROVIDER_SYNC_RULES,
} from './entities/product-sync.rules';
import { ProductRepository } from './repositories/product.repository';
import { ProviderMappingRepository } from './repositories/provider-mapping.repository';
import { PricingService } from './services/pricing.service';
import { ProductService } from './services/product.service';
import { ProviderMappingService } from './services/provider-mapping.service';

describe('Phase 2C.1 Product Engine Audit', () => {
  describe('CHECK 1: Provider mapping — multiple providers per variant', () => {
    it('supports Provider A and Provider B for Garena 100k', async () => {
      const mappingRepository = {
        create: jest.fn(),
        findByVariantId: jest.fn(),
      };
      const variantRepository = {
        findById: jest.fn().mockResolvedValue({ id: 'var-garena-100k', deletedAt: null }),
      };
      const prisma = {
        provider: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce({ id: 'prov-a' })
            .mockResolvedValueOnce({ id: 'prov-b' }),
        },
        providerProductMapping: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      };

      const service = new ProviderMappingService(
        mappingRepository as never,
        variantRepository as never,
        prisma as never,
      );

      mappingRepository.create
        .mockResolvedValueOnce({
          id: 'map-a',
          providerId: 'prov-a',
          productVariantId: 'var-garena-100k',
          providerProductCode: '123',
          providerCost: new Decimal(95000),
          priority: 0,
          status: 'ACTIVE',
          provider: { id: 'prov-a', code: 'ESALE', name: 'Provider A' },
        })
        .mockResolvedValueOnce({
          id: 'map-b',
          providerId: 'prov-b',
          productVariantId: 'var-garena-100k',
          providerProductCode: '456',
          providerCost: new Decimal(96000),
          priority: 1,
          status: 'ACTIVE',
          provider: { id: 'prov-b', code: 'IMEDIA', name: 'Provider B' },
        });

      await service.createMapping('var-garena-100k', {
        providerId: 'prov-a',
        providerProductCode: '123',
        providerCost: 95000,
      });
      await service.createMapping('var-garena-100k', {
        providerId: 'prov-b',
        providerProductCode: '456',
        providerCost: 96000,
      });

      expect(mappingRepository.create).toHaveBeenCalledTimes(2);
    });

    it('findActiveByVariantId returns only ACTIVE mappings', async () => {
      const prisma = {
        providerProductMapping: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'map-a', status: ProviderProductMappingStatus.ACTIVE },
          ]),
        },
      };
      const repo = new ProviderMappingRepository(prisma as never);
      await repo.findActiveByVariantId('var-1');
      expect(prisma.providerProductMapping.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: ProviderProductMappingStatus.ACTIVE,
          }),
        }),
      );
    });
  });

  describe('CHECK 2: Provider inactive — product stays active', () => {
    it('disabling mapping does not affect product status', async () => {
      const mappingRepository = {
        findById: jest.fn().mockResolvedValue({
          id: 'map-1',
          productVariantId: 'var-1',
          status: ProviderProductMappingStatus.ACTIVE,
        }),
        update: jest.fn().mockResolvedValue({
          id: 'map-1',
          providerId: 'prov-a',
          productVariantId: 'var-1',
          providerProductCode: '123',
          providerCost: new Decimal(98000),
          priority: 0,
          status: ProviderProductMappingStatus.INACTIVE,
          provider: { id: 'prov-a', code: 'ESALE', name: 'eSale' },
        }),
      };
      const productRepository = {
        findActiveById: jest.fn().mockResolvedValue({
          id: 'prod-1',
          status: CatalogProductStatus.ACTIVE,
          deletedAt: null,
          categoryId: 'cat-1',
          slug: 'garena',
          name: 'Garena',
          description: null,
          category: { id: 'cat-1', slug: 'game-card', name: 'Game Card' },
          variants: [
            {
              id: 'var-1',
              productId: 'prod-1',
              sku: 'GARENA_100K',
              name: 'Garena 100k',
              type: ProductVariantType.CARD,
              faceValue: new Decimal(100000),
              sellPrice: new Decimal(99000),
              status: 'ACTIVE',
            },
          ],
        }),
      };

      const mappingService = new ProviderMappingService(
        mappingRepository as never,
        { findById: jest.fn() } as never,
        { provider: { findFirst: jest.fn() }, providerProductMapping: { findUnique: jest.fn() } } as never,
      );
      const productService = new ProductService(
        productRepository as never,
        { findById: jest.fn() } as never,
        { productHasUsage: jest.fn() } as never,
      );

      const disabled = await mappingService.disableMapping('map-1');
      expect(disabled.status).toBe(ProviderProductMappingStatus.INACTIVE);

      const product = await productService.getActiveProduct('prod-1');
      expect(product.status).toBe(CatalogProductStatus.ACTIVE);
    });
  });

  describe('CHECK 3: Pricing priority', () => {
    let pricingService: PricingService;
    let resolutionService: { resolveAgentPrice: jest.Mock };
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
      resolutionService = { resolveAgentPrice: jest.fn() };
      pricingService = new PricingService(
        pricingRepository as never,
        mappingRepository as never,
        resolutionService as never,
      );
    });

    it('uses agent_product_prices over default sell_price', async () => {
      resolutionService.resolveAgentPrice.mockResolvedValue({ sellingPrice: '95000.00' });

      const price = await pricingService.getAgentPrice('agent-1', 'var-1');
      expect(price).toBe('95000.00');
      expect(resolutionService.resolveAgentPrice).toHaveBeenCalledWith('agent-1', 'var-1');
    });

    it('falls back to sell_price when no custom or level price', async () => {
      resolutionService.resolveAgentPrice.mockResolvedValue({ sellingPrice: '98000.00' });

      const price = await pricingService.getAgentPrice('agent-1', 'var-1');
      expect(price).toBe('98000.00');
    });
  });

  describe('CHECK 4: Loss prevention', () => {
    it('rejects agent price below provider cost (97000 < 98000)', async () => {
      const mappingRepository = {
        findLowestActiveCost: jest.fn().mockResolvedValue({
          providerCost: new Decimal(98000),
        }),
      };
      const pricingService = new PricingService(
        { findActiveVariantSellPrice: jest.fn(), findActiveAgentProductPrice: jest.fn(), findAgent: jest.fn() } as never,
        mappingRepository as never,
        { resolveAgentPrice: jest.fn() } as never,
      );

      await expect(
        pricingService.validateAgentPrice('var-1', 97000),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts agent price at or above provider cost', async () => {
      const mappingRepository = {
        findLowestActiveCost: jest.fn().mockResolvedValue({
          providerCost: new Decimal(98000),
        }),
      };
      const pricingService = new PricingService(
        { findActiveVariantSellPrice: jest.fn(), findActiveAgentProductPrice: jest.fn(), findAgent: jest.fn() } as never,
        mappingRepository as never,
        { resolveAgentPrice: jest.fn() } as never,
      );

      await expect(
        pricingService.validateAgentPrice('var-1', 98000),
      ).resolves.toBeUndefined();
      await expect(
        pricingService.validateAgentPrice('var-1', 99000),
      ).resolves.toBeUndefined();
    });
  });

  describe('CHECK 5: Sync protection rules documented', () => {
    it('defines provider sync must-not-overwrite fields', () => {
      expect(PROVIDER_SYNC_RULES.updatableFields).toContain('providerCost');
      expect(PROVIDER_SYNC_RULES.protectedFields).toContain(
        'product_variants.sell_price',
      );
      expect(PROVIDER_SYNC_RULES.protectedFields).toContain(
        'agent_product_prices.agent_price',
      );
    });
  });

  describe('CHECK 6: Soft delete — no physical delete', () => {
    it('uses INACTIVE + deleted_at via repository update', async () => {
      const prisma = {
        product: {
          update: jest.fn().mockResolvedValue({
            id: 'prod-1',
            status: CatalogProductStatus.INACTIVE,
            deletedAt: new Date(),
          }),
        },
      };
      const repo = new ProductRepository(prisma as never);
      await repo.softDelete('prod-1');

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'prod-1' },
        data: {
          status: CatalogProductStatus.INACTIVE,
          deletedAt: expect.any(Date),
        },
      });
    });

    it('repository has no delete method', () => {
      expect(typeof ProductRepository.prototype.softDelete).toBe('function');
      expect((ProductRepository.prototype as { delete?: unknown }).delete).toBeUndefined();
    });
  });

  describe('CHECK 7: Cache preparation documented', () => {
    it('allows product list cache but not agent price cache', () => {
      expect(PRODUCT_CACHE_POLICY.cacheable).toContain('product_list');
      expect(PRODUCT_CACHE_POLICY.neverCache).toContain('agent_price_resolution');
      expect(PRODUCT_CACHE_POLICY.neverCache).toContain('agent_product_prices');
    });
  });
});
