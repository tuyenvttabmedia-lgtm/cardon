import { Injectable } from '@nestjs/common';
import { Prisma, ProviderProductMappingStatus, ProviderProductAvailability } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class ProviderMappingRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.ProviderProductMappingCreateInput) {
    return this.prisma.providerProductMapping.create({
      data,
      include: { provider: true, productVariant: true },
    });
  }

  update(id: string, data: Prisma.ProviderProductMappingUpdateInput) {
    return this.prisma.providerProductMapping.update({
      where: { id },
      data,
      include: { provider: true, productVariant: true },
    });
  }

  findById(id: string) {
    return this.prisma.providerProductMapping.findUnique({
      where: { id },
      include: { provider: true },
    });
  }

  findByVariantId(variantId: string) {
    return this.prisma.providerProductMapping.findMany({
      where: { productVariantId: variantId },
      include: { provider: true },
      orderBy: [{ priority: 'asc' }, { providerCost: 'asc' }],
    });
  }

  findActiveByVariantId(variantId: string) {
    return this.prisma.providerProductMapping.findMany({
      where: {
        productVariantId: variantId,
        status: ProviderProductMappingStatus.ACTIVE,
      },
      include: { provider: true },
      orderBy: [{ priority: 'asc' }, { providerCost: 'asc' }],
    });
  }

  findByProviderId(providerId: string) {
    return this.prisma.providerProductMapping.findMany({
      where: { providerId },
      include: { productVariant: true },
      orderBy: [{ priority: 'asc' }, { providerCost: 'asc' }],
    });
  }

  findLowestActiveCost(variantId: string) {
    return this.prisma.providerProductMapping.findFirst({
      where: {
        productVariantId: variantId,
        status: ProviderProductMappingStatus.ACTIVE,
      },
      orderBy: { providerCost: 'asc' },
      select: { providerCost: true },
    });
  }

  markProviderAvailability(
    providerId: string,
    availability: ProviderProductAvailability,
  ) {
    return this.prisma.providerProductMapping.updateMany({
      where: { providerId, status: ProviderProductMappingStatus.ACTIVE },
      data: { availability },
    });
  }
}
