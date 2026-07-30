import { Injectable } from '@nestjs/common';
import { ProductVariantStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { ACTIVE_PRODUCT_WHERE, ACTIVE_VARIANT_WHERE } from '../../product/entities/product.constants';
import { PricingService } from '../../product/services/pricing.service';
import { ProviderRepository } from '../../provider/repositories/provider.repository';

@Injectable()
export class AgentApiCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRepository: ProviderRepository,
    private readonly pricingService: PricingService,
  ) {}

  /**
   * All ACTIVE catalog SKUs with resolved agent_price
   * (override → margin config by homeService → sellPrice fallback).
   */
  async listProducts(agentId: string) {
    const variants = await this.prisma.productVariant.findMany({
      where: {
        ...ACTIVE_VARIANT_WHERE,
        status: ProductVariantStatus.ACTIVE,
        product: ACTIVE_PRODUCT_WHERE,
      },
      select: {
        id: true,
        sku: true,
        name: true,
        faceValue: true,
        status: true,
        product: { select: { name: true } },
      },
      orderBy: { sku: 'asc' },
      take: 2000,
    });

    const items = await Promise.all(
      variants.map(async (variant) => {
        const resolved = await this.pricingService.resolveAgentPrice(agentId, variant.id);
        return {
          product_code: variant.sku,
          name: variant.name,
          category: variant.product.name,
          face_value: variant.faceValue.toFixed(2),
          agent_price: resolved.sellingPrice,
          status: variant.status,
        };
      }),
    );

    return { items };
  }

  async listProviders() {
    const providers = await this.providerRepository.listActiveProviders();
    // Do not expose upstream NCC identity to Partner API clients.
    return {
      items: providers.length
        ? [{ code: 'cardon', name: 'CardOn', status: 'ACTIVE' }]
        : [],
    };
  }
}
