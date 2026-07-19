import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { decimalToString } from '../entities/product.mapper';
import { PricingRepository } from '../repositories/pricing.repository';
import { ProviderMappingRepository } from '../repositories/provider-mapping.repository';
import { PricingResolutionService } from './pricing-resolution.service';

@Injectable()
export class PricingService {
  constructor(
    private readonly pricingRepository: PricingRepository,
    private readonly mappingRepository: ProviderMappingRepository,
    private readonly resolutionService: PricingResolutionService,
  ) {}

  /**
   * B2C price — always product_variants.sell_price for ACTIVE variant.
   */
  async getCustomerPrice(variantId: string): Promise<string> {
    const variant = await this.pricingRepository.findActiveVariantSellPrice(
      variantId,
    );
    if (!variant) {
      throw new NotFoundException('Active variant not found');
    }
    return decimalToString(variant.sellPrice);
  }

  /**
   * Agent price resolution priority:
   * 1. agent_product_prices (custom override)
   * 2. pricing group variant price / group discount
   * 3. discount rules (by priority)
   * 4. default sell_price
   */
  async getAgentPrice(agentId: string, variantId: string): Promise<string> {
    const resolved = await this.resolutionService.resolveAgentPrice(agentId, variantId);
    return resolved.sellingPrice;
  }

  async resolveAgentPrice(
    agentId: string,
    variantId: string,
    options?: { allowBelowCost?: boolean },
  ) {
    return this.resolutionService.resolveAgentPrice(agentId, variantId, options);
  }

  /**
   * Loss prevention — agent custom price must not be below lowest active provider cost.
   * Call before creating/updating agent_product_prices.
   */
  async validateAgentPrice(variantId: string, agentPrice: number): Promise<void> {
    const lowest = await this.mappingRepository.findLowestActiveCost(variantId);
    if (!lowest) {
      return;
    }

    const minCost = Number(lowest.providerCost);
    if (agentPrice < minCost) {
      throw new BadRequestException(
        `Agent price cannot be lower than provider cost (${decimalToString(lowest.providerCost)})`,
      );
    }
  }
}
