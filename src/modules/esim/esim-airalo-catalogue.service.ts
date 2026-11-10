import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CatalogProductStatus,
  EsimCatalogLifecycle,
  HomeServiceType,
  Prisma,
  ProductVariantStatus,
  ProductVariantType,
  ProviderProductAvailability,
  ProviderProductMappingStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { SettingsStoreService } from '../settings/services/settings-store.service';
import { EsimAiraloAdapter, type AiraloCataloguePackage } from './esim-airalo.adapter';
import { EsimAiraloCatalogueRepository } from './esim-airalo-catalogue.repository';
import {
  countryNameVi,
  activationLabelVi,
  costVndFromAiralo,
  destPhotoPath,
  lifecycleForImportedRow,
  retailVndFromAiralo,
  selectPublishablePackages,
  sellPriceFromAiralo,
  slugForDestination,
  type EsimCatalogLifecycleName,
} from './esim-catalogue.rules';

const CATEGORY_SLUG = 'esim-du-lich';

export interface AiraloImportSummary {
  imported: number;
  published: number;
  mapped: number;
  reviewRequired: number;
  inactive: number;
  destinationsPublished: string[];
}

@Injectable()
export class EsimAiraloCatalogueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: EsimAiraloCatalogueRepository,
    private readonly airalo: EsimAiraloAdapter,
    private readonly settings: SettingsStoreService,
  ) {}

  async listAdminCatalogue() {
    const packages = await this.repository.listPackages();
    const counts = await this.repository.countByLifecycle();
    return {
      counts: Object.fromEntries(counts.map((row) => [row.lifecycle, row._count._all])),
      packages: packages.map((row) => ({
        id: row.id,
        providerPackageId: row.providerPackageId,
        destinationKey: row.destinationKey,
        countryIso: row.countryIso,
        title: row.title,
        operatorTitle: row.operatorTitle,
        packageType: row.packageType,
        validityDays: row.validityDays,
        dataAmountMb: row.dataAmountMb,
        isUnlimited: row.isUnlimited,
        fupClear: row.fupClear,
        costCurrency: row.costCurrency,
        costAmount: Number(row.costAmount.toString()),
        costVnd: Number(row.costVnd.toString()),
        sellPriceVnd: Number(row.sellPriceVnd.toString()),
        lifecycle: row.lifecycle,
        reviewReason: row.reviewReason,
        variantId: row.variantId,
        productSlug: row.variant?.product.slug ?? null,
        productName: row.variant?.product.name ?? null,
      })),
    };
  }

  async importFromAiralo(): Promise<AiraloImportSummary> {
    const provider = await this.repository.findAiraloProvider();
    if (!provider) {
      throw new BadRequestException('AIRALO provider is missing. Save Airalo credentials first.');
    }
    const usdVndRate = this.settings.resolveAiraloUsdVndRate();
    const remote = await this.airalo.listCataloguePackages();
    const priced = remote.map((pkg) => this.pricePackage(pkg, usdVndRate));
    const selectedIds = new Set(
      selectPublishablePackages(priced).map((pkg) => pkg.providerPackageId),
    );
    const existing = await this.prisma.esimAiraloPackage.findMany({
      select: { id: true, providerPackageId: true, lifecycle: true, variantId: true },
    });
    const existingById = new Map(existing.map((row) => [row.providerPackageId, row]));
    const category = await this.ensureCategory();

    for (const pkg of priced) {
      const previous = existingById.get(pkg.providerPackageId);
      if (previous?.lifecycle === EsimCatalogLifecycle.INACTIVE) {
        await this.repository.upsertPackage(
          this.packageRow(provider.id, pkg, previous.lifecycle, previous.variantId, usdVndRate),
        );
        continue;
      }
      const selected = selectedIds.has(pkg.providerPackageId);
      let variantId = previous?.variantId ?? null;
      if (selected || variantId) {
        variantId = await this.ensureMappedVariant(category.id, provider.id, pkg);
      }
      const lifecycle = resolveImportLifecycle(previous?.lifecycle, {
        mapped: Boolean(variantId),
        costVnd: pkg.costVnd,
        sellPriceVnd: pkg.sellPriceVnd,
        selectedForPublish: selected,
      });
      if (variantId) {
        await this.syncVariantSale(variantId, pkg, lifecycle === EsimCatalogLifecycle.PUBLISHED);
      }
      await this.repository.upsertPackage(
        this.packageRow(provider.id, pkg, lifecycle, variantId, usdVndRate),
      );
    }

    if (priced.length > 0) {
      const remoteIds = new Set(priced.map((pkg) => pkg.providerPackageId));
      for (const row of existing) {
        if (row.lifecycle === EsimCatalogLifecycle.PUBLISHED && !remoteIds.has(row.providerPackageId)) {
          await this.setLifecycle(row.id, EsimCatalogLifecycle.INACTIVE);
        }
      }
    }

    return this.summary();
  }

  async setLifecycle(id: string, lifecycle: EsimCatalogLifecycle) {
    const row = await this.repository.findPackageById(id);
    if (!row) {
      throw new BadRequestException('Airalo package not found');
    }
    if (lifecycle === EsimCatalogLifecycle.PUBLISHED) {
      if (!row.variantId || Number(row.costVnd.toString()) <= 0 || Number(row.sellPriceVnd.toString()) <= 0) {
        throw new BadRequestException('Package must be mapped with cost and sell price before publish');
      }
      await this.prisma.productVariant.update({
        where: { id: row.variantId },
        data: { status: ProductVariantStatus.ACTIVE, deletedAt: null },
      });
      await this.prisma.providerProductMapping.updateMany({
        where: { productVariantId: row.variantId, providerId: row.providerId },
        data: { status: ProviderProductMappingStatus.ACTIVE, availability: ProviderProductAvailability.AVAILABLE },
      });
    }
    if (lifecycle === EsimCatalogLifecycle.INACTIVE && row.variantId) {
      await this.prisma.productVariant.update({
        where: { id: row.variantId },
        data: { status: ProductVariantStatus.INACTIVE },
      });
      await this.prisma.providerProductMapping.updateMany({
        where: { productVariantId: row.variantId, providerId: row.providerId },
        data: { status: ProviderProductMappingStatus.INACTIVE },
      });
    }
    return this.repository.setPackageLifecycle(id, {
      lifecycle,
      publishedAt: lifecycle === EsimCatalogLifecycle.PUBLISHED ? new Date() : null,
      reviewReason: lifecycle === EsimCatalogLifecycle.REVIEW_REQUIRED ? row.reviewReason : null,
    });
  }

  private async summary(): Promise<AiraloImportSummary> {
    const counts = await this.repository.countByLifecycle();
    const published = await this.prisma.esimAiraloPackage.findMany({
      where: { lifecycle: EsimCatalogLifecycle.PUBLISHED },
      select: { destinationKey: true },
    });
    const map = Object.fromEntries(counts.map((row) => [row.lifecycle, row._count._all]));
    return {
      imported: Object.values(map).reduce((sum, count) => sum + count, 0),
      published: map.PUBLISHED ?? 0,
      mapped: map.MAPPED ?? 0,
      reviewRequired: map.REVIEW_REQUIRED ?? 0,
      inactive: map.INACTIVE ?? 0,
      destinationsPublished: [...new Set(published.map((row) => row.destinationKey))].sort(),
    };
  }

  private pricePackage(pkg: AiraloCataloguePackage, usdVndRate: number) {
    const cost = costVndFromAiralo({
      netPriceVnd: pkg.netPriceVnd,
      netPriceUsd: pkg.netPriceUsd,
      usdVndRate,
    });
    const retailVnd = retailVndFromAiralo({
      retailPriceVnd: pkg.retailPriceVnd,
      retailPriceUsd: pkg.retailPriceUsd,
      usdVndRate,
    });
    return {
      ...pkg,
      ...cost,
      retailVnd,
      sellPriceVnd: sellPriceFromAiralo(cost.costVnd, retailVnd),
    };
  }

  private packageRow(
    providerId: string,
    pkg: ReturnType<EsimAiraloCatalogueService['pricePackage']>,
    lifecycle: EsimCatalogLifecycle,
    variantId: string | null,
    usdVndRate: number,
  ): Prisma.EsimAiraloPackageUncheckedCreateInput {
    const reviewReason =
      lifecycle === EsimCatalogLifecycle.REVIEW_REQUIRED
        ? 'Missing cost or sell price after Airalo import'
        : null;
    return {
      providerPackageId: pkg.providerPackageId,
      providerId,
      variantId,
      countryIso: pkg.countryIso.slice(0, 8),
      destinationKey: pkg.destinationKey.slice(0, 32),
      operatorTitle: pkg.operatorTitle.slice(0, 255),
      title: pkg.title.slice(0, 255),
      packageType: pkg.packageType.slice(0, 32),
      validityDays: pkg.validityDays,
      dataAmountMb: pkg.dataAmountMb,
      isUnlimited: pkg.isUnlimited,
      fupClear: pkg.fupClear,
      costCurrency: pkg.costCurrency,
      costAmount: new Prisma.Decimal(pkg.costAmount),
      costVnd: new Prisma.Decimal(pkg.costVnd),
      sellPriceVnd: new Prisma.Decimal(pkg.sellPriceVnd),
      usdVndRate: new Prisma.Decimal(usdVndRate),
      lifecycle,
      reviewReason,
      rawSafeMeta: {
        countries: pkg.countries,
        destinationKey: pkg.destinationKey,
        shortInfo: pkg.shortInfo,
        operatorInfo: pkg.operatorInfo,
        activationPolicy: pkg.activationPolicy,
        apnType: pkg.apnType,
        networks: pkg.networks,
        networkTypes: pkg.networkTypes,
        retailVnd: pkg.retailVnd,
      },
      importedAt: new Date(),
      publishedAt: lifecycle === EsimCatalogLifecycle.PUBLISHED ? new Date() : null,
    };
  }

  private async ensureCategory() {
    return this.prisma.productCategory.upsert({
      where: { slug: CATEGORY_SLUG },
      create: {
        slug: CATEGORY_SLUG,
        name: 'eSIM du lịch',
        homeService: HomeServiceType.ESIM,
        status: 'ACTIVE',
      },
      update: { homeService: HomeServiceType.ESIM, status: 'ACTIVE' },
    });
  }

  private async ensureMappedVariant(
    categoryId: string,
    providerId: string,
    pkg: ReturnType<EsimAiraloCatalogueService['pricePackage']>,
  ): Promise<string> {
    const slug = slugForDestination(pkg.destinationKey);
    if (!slug) {
      throw new BadRequestException(`No product slug for destination ${pkg.destinationKey}`);
    }
    const name = `eSIM ${countryNameVi(pkg.destinationKey) || countryNameVi(pkg.countryIso) || pkg.destinationKey}`;
    const product = await this.prisma.product.upsert({
      where: { slug },
      create: {
        categoryId,
        homeService: HomeServiceType.ESIM,
        slug,
        name,
        description: `Gói eSIM ${name.replace(/^eSIM /, '')} trên CardOn.`,
        logoUrl: destPhotoPath(pkg.destinationKey || pkg.countryIso) || pkg.countryImageUrl || null,
        status: CatalogProductStatus.ACTIVE,
      },
      update: {
        categoryId,
        homeService: HomeServiceType.ESIM,
        name,
        logoUrl: destPhotoPath(pkg.destinationKey || pkg.countryIso) || pkg.countryImageUrl || undefined,
        deletedAt: null,
        status: CatalogProductStatus.ACTIVE,
      },
    });
    const sku = skuForPackage(pkg.providerPackageId);
    const existing = await this.prisma.productVariant.findUnique({
      where: { sku },
      select: { id: true },
    });
    const metadata = {
      catalogue: catalogueFacts(pkg),
    };
    const variant = existing
      ? await this.prisma.productVariant.update({
          where: { id: existing.id },
          data: {
            productId: product.id,
            name: variantTitle(pkg),
            faceValue: new Prisma.Decimal(pkg.sellPriceVnd),
            sellPrice: new Prisma.Decimal(pkg.sellPriceVnd),
            metadata,
            deletedAt: null,
          },
        })
      : await this.prisma.productVariant.create({
          data: {
            productId: product.id,
            sku,
            name: variantTitle(pkg),
            type: ProductVariantType.ESIM,
            faceValue: new Prisma.Decimal(pkg.sellPriceVnd),
            sellPrice: new Prisma.Decimal(pkg.sellPriceVnd),
            status: ProductVariantStatus.INACTIVE,
            metadata,
          },
        });
    const mapping = await this.prisma.providerProductMapping.findFirst({
      where: { providerId, productVariantId: variant.id },
    });
    if (mapping) {
      await this.prisma.providerProductMapping.update({
        where: { id: mapping.id },
        data: {
          providerProductCode: pkg.providerPackageId,
          providerCost: new Prisma.Decimal(pkg.costVnd),
        },
      });
    } else {
      await this.prisma.providerProductMapping.create({
        data: {
          providerId,
          productVariantId: variant.id,
          providerProductCode: pkg.providerPackageId,
          providerCost: new Prisma.Decimal(pkg.costVnd),
          priority: 1,
          status: ProviderProductMappingStatus.INACTIVE,
          availability: ProviderProductAvailability.AVAILABLE,
        },
      });
    }
    return variant.id;
  }

  private async syncVariantSale(
    variantId: string,
    pkg: ReturnType<EsimAiraloCatalogueService['pricePackage']>,
    published: boolean,
  ) {
    await this.prisma.productVariant.update({
      where: { id: variantId },
      data: {
        sellPrice: new Prisma.Decimal(pkg.sellPriceVnd),
        faceValue: new Prisma.Decimal(pkg.sellPriceVnd),
        status: published ? ProductVariantStatus.ACTIVE : ProductVariantStatus.INACTIVE,
        deletedAt: null,
      },
    });
    await this.prisma.providerProductMapping.updateMany({
      where: { productVariantId: variantId, provider: { code: 'AIRALO' } },
      data: {
        providerProductCode: pkg.providerPackageId,
        providerCost: new Prisma.Decimal(pkg.costVnd),
        status: published ? ProviderProductMappingStatus.ACTIVE : ProviderProductMappingStatus.INACTIVE,
        availability: ProviderProductAvailability.AVAILABLE,
      },
    });
  }
}

function resolveImportLifecycle(
  previous: EsimCatalogLifecycle | undefined,
  input: {
    mapped: boolean;
    costVnd: number;
    sellPriceVnd: number;
    selectedForPublish: boolean;
  },
): EsimCatalogLifecycle {
  if (previous === EsimCatalogLifecycle.PUBLISHED || previous === EsimCatalogLifecycle.INACTIVE) {
    return previous;
  }
  return lifecycleForImportedRow(input) as EsimCatalogLifecycleName as EsimCatalogLifecycle;
}

function catalogueFacts(pkg: {
  destinationKey: string;
  countryIso: string;
  title: string;
  operatorTitle: string;
  providerPackageId: string;
  validityDays: number;
  dataAmountMb: number;
  isUnlimited: boolean;
  packageType: string;
  shortInfo: string;
  operatorInfo: string[];
  otherInfo: string;
  countryImageUrl: string;
  operatorImageUrl: string;
  activationPolicy: string;
  apnType: string;
  apnValue: string;
  isRoaming: boolean;
  rechargeable: boolean;
  planType: string;
  networks: string[];
  networkTypes: string[];
  fairUsagePolicy: string;
}) {
  return {
    publicSlug: publicSlugFor(pkg),
    providerDescription: pkg.shortInfo || pkg.title,
    countryIso: displayIso(pkg.destinationKey, pkg.countryIso),
    countryName: countryNameVi(pkg.destinationKey) || countryNameVi(pkg.countryIso) || pkg.countryIso,
    dataAmountMb: pkg.dataAmountMb,
    duration: pkg.validityDays,
    durationUnit: 'day',
    unlimited: pkg.isUnlimited,
    speed: pkg.networkTypes,
    operators: pkg.operatorTitle ? [pkg.operatorTitle] : [],
    group: pkg.planType || pkg.packageType,
    shortInfo: pkg.shortInfo,
    operatorInfo: pkg.operatorInfo,
    otherInfo: pkg.otherInfo,
    activationPolicy: pkg.activationPolicy,
    activationLabel: activationLabelVi(pkg.activationPolicy),
    apnType: pkg.apnType,
    apnValue: pkg.apnValue,
    isRoaming: pkg.isRoaming,
    rechargeable: pkg.rechargeable,
    networks: pkg.networks,
    countryImageUrl: pkg.countryImageUrl,
    operatorImageUrl: pkg.operatorImageUrl,
    fairUsagePolicy: pkg.fairUsagePolicy,
  };
}

function skuForPackage(providerPackageId: string): string {
  return `ESIM_AL_${providerPackageId}`
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '_')
    .slice(0, 128);
}

function publicSlugFor(pkg: { destinationKey: string; providerPackageId: string }): string {
  return `${pkg.destinationKey}-${pkg.providerPackageId}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 128);
}

function variantTitle(pkg: { title: string; destinationKey: string; validityDays: number }): string {
  const dest = countryNameVi(pkg.destinationKey);
  if (pkg.title.toLowerCase().includes(dest.toLowerCase())) return pkg.title;
  return `${dest} — ${pkg.title}`;
}

function displayIso(destinationKey: string, countryIso: string): string {
  if (destinationKey === 'asia') return 'ASIA';
  if (destinationKey === 'europe') return 'EUROPE';
  return countryIso.toUpperCase() || destinationKey.toUpperCase();
}
