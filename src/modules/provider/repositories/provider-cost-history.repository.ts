import { Injectable } from '@nestjs/common';
import { ProviderTransactionStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class ProviderCostHistoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  recordChange(params: {
    providerId: string;
    variantId: string;
    oldCost: Decimal;
    newCost: Decimal;
  }) {
    return this.prisma.providerCostHistory.create({
      data: {
        providerId: params.providerId,
        variantId: params.variantId,
        oldCost: params.oldCost,
        newCost: params.newCost,
      },
    });
  }

  listByProvider(providerId: string, take = 50) {
    return this.prisma.providerCostHistory.findMany({
      where: { providerId },
      include: {
        productVariant: { select: { id: true, sku: true, name: true } },
      },
      orderBy: { changedAt: 'desc' },
      take,
    });
  }
}
