import { EsimCatalogLifecycle, Prisma } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class EsimAiraloCatalogueRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAiraloProvider() {
    return this.prisma.provider.findFirst({
      where: { code: 'AIRALO', deletedAt: null },
      select: { id: true, code: true, status: true },
    });
  }

  listPackages() {
    return this.prisma.esimAiraloPackage.findMany({
      orderBy: [{ destinationKey: 'asc' }, { validityDays: 'asc' }, { title: 'asc' }],
      include: {
        variant: {
          select: {
            id: true,
            sku: true,
            status: true,
            sellPrice: true,
            product: { select: { id: true, slug: true, name: true, status: true } },
          },
        },
      },
    });
  }

  findPackageById(id: string) {
    return this.prisma.esimAiraloPackage.findUnique({
      where: { id },
      include: {
        variant: {
          select: { id: true, status: true, productId: true },
        },
      },
    });
  }

  upsertPackage(data: Prisma.EsimAiraloPackageUncheckedCreateInput) {
    return this.prisma.esimAiraloPackage.upsert({
      where: { providerPackageId: data.providerPackageId },
      create: data,
      update: {
        countryIso: data.countryIso,
        destinationKey: data.destinationKey,
        operatorTitle: data.operatorTitle,
        title: data.title,
        packageType: data.packageType,
        validityDays: data.validityDays,
        dataAmountMb: data.dataAmountMb,
        isUnlimited: data.isUnlimited,
        fupClear: data.fupClear,
        costCurrency: data.costCurrency,
        costAmount: data.costAmount,
        costVnd: data.costVnd,
        sellPriceVnd: data.sellPriceVnd,
        usdVndRate: data.usdVndRate,
        lifecycle: data.lifecycle,
        reviewReason: data.reviewReason,
        rawSafeMeta: data.rawSafeMeta,
        importedAt: data.importedAt,
        publishedAt: data.publishedAt,
        variantId: data.variantId,
      },
    });
  }

  setPackageLifecycle(
    id: string,
    data: {
      lifecycle: EsimCatalogLifecycle;
      reviewReason?: string | null;
      publishedAt?: Date | null;
      variantId?: string | null;
    },
  ) {
    return this.prisma.esimAiraloPackage.update({
      where: { id },
      data,
    });
  }

  countByLifecycle() {
    return this.prisma.esimAiraloPackage.groupBy({
      by: ['lifecycle'],
      _count: { _all: true },
    });
  }
}
