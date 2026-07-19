import { Injectable } from '@nestjs/common';
import { AgentProductPriceStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { ACTIVE_VARIANT_WHERE } from '../entities/product.constants';

@Injectable()
export class PricingRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveVariantSellPrice(variantId: string) {
    return this.prisma.productVariant.findFirst({
      where: { id: variantId, ...ACTIVE_VARIANT_WHERE },
      select: { sellPrice: true },
    });
  }

  findActiveAgentProductPrice(agentId: string, variantId: string) {
    return this.prisma.agentProductPrice.findFirst({
      where: {
        agentId,
        variantId,
        status: AgentProductPriceStatus.ACTIVE,
      },
      select: { agentPrice: true },
    });
  }

  findAgent(agentId: string) {
    return this.prisma.agent.findFirst({
      where: { id: agentId, deletedAt: null },
      select: { id: true },
    });
  }
}
