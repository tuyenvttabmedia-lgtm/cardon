import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AgentProductPriceStatus,
  HomeServiceType,
  ProviderProductMappingStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../../database/prisma.service';
import {
  computeMarginPrice,
  formatMarginRuleLabel,
  PRODUCT_GROUP_LABELS,
} from '../entities/agent-margin.constants';
import { ACTIVE_VARIANT_WHERE } from '../entities/product.constants';
import { decimalToString } from '../entities/product.mapper';
import { AgentMarginConfigService } from './agent-margin-config.service';

export type PricingRuleSource = 'AGENT_OVERRIDE' | 'MARGIN_CONFIG' | 'FALLBACK_SELL';

export interface ResolvedAgentPrice {
  sellingPrice: string;
  providerCost: string | null;
  cardonMargin: string | null;
  marginTypeApplied: 'PERCENT' | 'FIXED' | null;
  marginValueApplied: number | null;
  ruleSource: PricingRuleSource;
  appliedRule: string | null;
  homeService: HomeServiceType | null;
}

@Injectable()
export class PricingResolutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly marginConfig: AgentMarginConfigService,
  ) {}

  async resolveAgentPrice(
    agentId: string,
    variantId: string,
    options?: { allowBelowCost?: boolean },
  ): Promise<ResolvedAgentPrice> {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, ...ACTIVE_VARIANT_WHERE },
      include: {
        product: { select: { homeService: true, name: true } },
      },
    });
    if (!variant) throw new NotFoundException('Active variant not found');

    const agent = await this.prisma.agent.findFirst({
      where: { id: agentId, deletedAt: null },
      select: { id: true },
    });
    if (!agent) throw new NotFoundException('Agent not found');

    const homeService = variant.product.homeService;
    const lowest = await this.prisma.providerProductMapping.findFirst({
      where: {
        productVariantId: variantId,
        status: ProviderProductMappingStatus.ACTIVE,
      },
      orderBy: { providerCost: 'asc' },
      select: { providerCost: true },
    });
    const providerCost = lowest ? Number(lowest.providerCost) : null;

    const override = await this.prisma.agentProductPrice.findFirst({
      where: { agentId, variantId, status: AgentProductPriceStatus.ACTIVE },
    });
    if (override) {
      const price = Number(override.agentPrice);
      return {
        sellingPrice: decimalToString(override.agentPrice),
        providerCost: providerCost != null ? providerCost.toFixed(2) : null,
        cardonMargin:
          providerCost != null ? (price - providerCost).toFixed(2) : null,
        marginTypeApplied: null,
        marginValueApplied: null,
        ruleSource: 'AGENT_OVERRIDE',
        appliedRule: 'Giá ghi đè thủ công',
        homeService,
      };
    }

    const config = await this.marginConfig.getConfig();
    const rule = this.marginConfig.getRuleForService(config, homeService);
    const label = PRODUCT_GROUP_LABELS[homeService];

    if (providerCost != null) {
      let price = computeMarginPrice(providerCost, rule, config.roundTo);
      if (price < providerCost && !options?.allowBelowCost) {
        price = providerCost;
      }
      return {
        sellingPrice: price.toFixed(2),
        providerCost: providerCost.toFixed(2),
        cardonMargin: (price - providerCost).toFixed(2),
        marginTypeApplied: rule.marginType,
        marginValueApplied: rule.value,
        ruleSource: 'MARGIN_CONFIG',
        appliedRule: formatMarginRuleLabel(label, rule),
        homeService,
      };
    }

    const fallback = Number(variant.sellPrice);
    return {
      sellingPrice: fallback.toFixed(2),
      providerCost: null,
      cardonMargin: null,
      marginTypeApplied: rule.marginType,
      marginValueApplied: rule.value,
      ruleSource: 'FALLBACK_SELL',
      appliedRule: `${label}: chưa có giá vốn NCC — dùng giá bán cơ bản`,
      homeService,
    };
  }
}
