import { Inject, Injectable } from '@nestjs/common';
import { HomeServiceType, Prisma, ProductVariantType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ESIM_PROVIDER_PORT, EsimBundleSummary, EsimConsumptionPrice, EsimProviderPort } from './esim-provider.port';
import { ESIM_AIRALO_PROVIDER_CODE, ESIM_GO_PROVIDER_CODE } from './esim.constants';

export { ESIM_AIRALO_PROVIDER_CODE, ESIM_GO_PROVIDER_CODE };
export const ESIM_AIRALO_CATALOGUE_CACHE_KEY = 'esim:catalogue:AIRALO';
/** @deprecated */
export const ESIM_GO_CATALOGUE_CACHE_KEY = ESIM_AIRALO_CATALOGUE_CACHE_KEY;
export const ESIM_AIRALO_CATALOGUE_TTL_MS = 15 * 60 * 1000;
/** @deprecated */
export const ESIM_GO_CATALOGUE_TTL_MS = ESIM_AIRALO_CATALOGUE_TTL_MS;

export interface EsimCatalogueMappingRow {
  id: string;
  providerId: string;
  providerCode: string;
  variantId: string;
  variantType: string;
  homeService: string;
  providerProductCode: string;
  providerCost: string;
}

export interface VerifiedBundleCost {
  bundleName: string;
  currency: string;
  unit: 'bundle';
  amountVnd: number;
}

export interface EsimCatalogueMappingStore {
  listMappings(): Promise<EsimCatalogueMappingRow[]>;
  updateCost(row: EsimCatalogueMappingRow, nextCost: string): Promise<void>;
}

export interface CatalogueCostDecision {
  updated: EsimCatalogueMappingRow[];
  rejected: Array<{ bundleName?: string; reason: string }>;
}

@Injectable()
export class PrismaEsimCatalogueMappingStore implements EsimCatalogueMappingStore {
  constructor(private readonly prisma: PrismaService) {}

  async listMappings(): Promise<EsimCatalogueMappingRow[]> {
    const rows = await this.prisma.providerProductMapping.findMany({
      select: {
        id: true,
        providerProductCode: true,
        providerCost: true,
        provider: { select: { id: true, code: true } },
        productVariant: {
          select: {
            id: true,
            type: true,
            product: { select: { homeService: true } },
          },
        },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      providerId: row.provider.id,
      providerCode: row.provider.code,
      variantId: row.productVariant.id,
      variantType: row.productVariant.type,
      homeService: row.productVariant.product.homeService,
      providerProductCode: row.providerProductCode,
      providerCost: row.providerCost.toString(),
    }));
  }

  async updateCost(row: EsimCatalogueMappingRow, nextCost: string): Promise<void> {
    if (
      row.providerCode !== ESIM_AIRALO_PROVIDER_CODE ||
      row.variantType !== ProductVariantType.ESIM ||
      row.homeService !== HomeServiceType.ESIM
    ) {
      throw new Error('Refusing to update a mapping outside AIRALO ESIM catalogue');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.providerProductMapping.update({
        where: { id: row.id },
        data: { providerCost: nextCost },
      });
      await tx.providerCostHistory.create({
        data: {
          providerId: row.providerId,
          variantId: row.variantId,
          oldCost: new Prisma.Decimal(row.providerCost),
          newCost: new Prisma.Decimal(nextCost),
        },
      });
    });
  }
}

@Injectable()
export class EsimCatalogSyncService {
  private readonly cache = new Map<string, { expiresAt: number; bundles: EsimBundleSummary[] }>();
  clock: () => number = () => Date.now();

  constructor(
    @Inject(ESIM_PROVIDER_PORT) private readonly provider: EsimProviderPort,
    @Inject(PrismaEsimCatalogueMappingStore) private readonly store: EsimCatalogueMappingStore,
  ) {}

  async loadCatalogue(): Promise<EsimBundleSummary[]> {
    const cached = this.cache.get(ESIM_AIRALO_CATALOGUE_CACHE_KEY);
    if (cached && cached.expiresAt > this.clock()) {
      return cached.bundles;
    }
    const bundles = await this.provider.listBundles();
    this.cache.set(ESIM_AIRALO_CATALOGUE_CACHE_KEY, {
      bundles,
      expiresAt: this.clock() + ESIM_AIRALO_CATALOGUE_TTL_MS,
    });
    return bundles;
  }

  /**
   * GET /catalogue/prices is a per-GB consumption list. It is not a verified bundle cost.
   */
  rejectConsumptionPrices(prices: EsimConsumptionPrice[]): CatalogueCostDecision {
    return {
      updated: [],
      rejected: prices.map((price) => ({
        bundleName: price.countryIso,
        reason: 'UNVERIFIED_PRICE_UNIT',
      })),
    };
  }

  async applyVerifiedBundleCosts(quotes: VerifiedBundleCost[]): Promise<CatalogueCostDecision> {
    const mappings = await this.store.listMappings();
    const updated: EsimCatalogueMappingRow[] = [];
    const rejected: CatalogueCostDecision['rejected'] = [];

    for (const quote of quotes) {
      if (!this.isVerifiedVndBundle(quote)) {
        rejected.push({ bundleName: quote.bundleName, reason: 'UNVERIFIED_CURRENCY_OR_UNIT' });
        continue;
      }
      const matches = mappings.filter((row) => this.isEsimGoBundleMapping(row, quote.bundleName));
      if (matches.length === 0) {
        rejected.push({ bundleName: quote.bundleName, reason: 'UNMAPPED_BUNDLE' });
        continue;
      }
      const nextCost = String(quote.amountVnd);
      for (const row of matches) {
        if (row.providerCost === nextCost) continue;
        await this.store.updateCost(row, nextCost);
        updated.push({ ...row, providerCost: nextCost });
      }
    }

    return { updated, rejected };
  }

  private isVerifiedVndBundle(quote: VerifiedBundleCost): boolean {
    return (
      quote.currency === 'VND' &&
      quote.unit === 'bundle' &&
      Number.isInteger(quote.amountVnd) &&
      quote.amountVnd > 0
    );
  }

  private isEsimGoBundleMapping(row: EsimCatalogueMappingRow, bundleName: string): boolean {
    return this.isAiraloBundleMapping(row, bundleName);
  }

  private isAiraloBundleMapping(row: EsimCatalogueMappingRow, bundleName: string): boolean {
    return (
      row.providerCode === ESIM_AIRALO_PROVIDER_CODE &&
      row.variantType === ProductVariantType.ESIM &&
      row.homeService === HomeServiceType.ESIM &&
      row.providerProductCode === bundleName
    );
  }
}
