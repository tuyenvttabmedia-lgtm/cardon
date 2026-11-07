import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EsimCatalogLifecycle } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { SettingsStoreService } from '../settings/services/settings-store.service';
import { ESIM_AIRALO_PROVIDER_CODE } from './esim.constants';
import {
  displayProviderText,
  presentStorefrontOfferText,
  storefrontLocale,
  type StorefrontLocale,
} from './esim-catalogue.rules';
import { evaluateEsimSale, esimSaleFlagsFromRuntime } from './esim-policy';
import { displayChargeForOffer } from './esim-checkout-options';
import { marketFromEsimPackage } from './esim-market.rules';
import { MANUAL_USD_VND_SOURCE, selectCheckoutFx } from '../fx/fx-rate.rules';

export const ESIM_JAPAN_PRODUCT_SLUG = 'esim-nhat-ban';
export const ESIM_KOREA_PRODUCT_SLUG = 'esim-han-quoc';

export interface EsimPublicOffer {
  id: string;
  variantId: string;
  productId: string;
  productSlug: string;
  productName: string;
  sku: string;
  title: string;
  providerDescription: string;
  summary: string;
  dataLabel: string;
  durationLabel: string;
  speedLabel: string;
  operators: string[];
  groupLabel: string;
  sellPriceVnd: number;
  market: 'VN' | 'INTL';
  chargeCurrency: 'VND' | 'USD' | null;
  chargeAmount: string | null;
  fxRate: string | null;
  countryIso: string;
  countryName: string;
  testData: false;
  photo: string | null;
  operatorInfo: string[];
  shortInfo: string;
  otherInfo: string;
  activationPolicy: string;
  activationLabel: string;
  apnType: string;
  apnValue: string;
  isRoaming: boolean;
  rechargeable: boolean;
  networks: string[];
  countryImageUrl: string;
  operatorImageUrl: string;
  fairUsagePolicy: string;
}

interface CatalogueFacts {
  publicSlug?: string;
  providerDescription?: string;
  countryIso?: string;
  countryName?: string;
  dataAmountMb?: number;
  duration?: number;
  durationUnit?: string;
  unlimited?: boolean;
  speed?: string[];
  operators?: string[];
  group?: string;
  shortInfo?: string;
  operatorInfo?: string[];
  otherInfo?: string;
  activationPolicy?: string;
  activationLabel?: string;
  apnType?: string;
  apnValue?: string;
  isRoaming?: boolean;
  rechargeable?: boolean;
  networks?: string[];
  countryImageUrl?: string;
  operatorImageUrl?: string;
  fairUsagePolicy?: string;
}

export interface EsimStorefrontCatalog {
  salesOpen: boolean;
  offers: EsimPublicOffer[];
}

@Injectable()
export class EsimPublicCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsStoreService,
    private readonly config: ConfigService,
  ) {}

  salesOpen(): boolean {
    return evaluateEsimSale(
      esimSaleFlagsFromRuntime(
        (key) => this.config.get(key),
        this.settings.resolveSystemConfig().customerEsimEnabled === true,
      ),
    ).ok;
  }

  async listStorefront(locale?: string): Promise<EsimStorefrontCatalog> {
    const offers = await this.listPublicOffers(locale);
    return { salesOpen: this.salesOpen(), offers };
  }

  async listPublicOffers(locale?: string): Promise<EsimPublicOffer[]> {
    const language = storefrontLocale(locale);
    const fxRate = await this.currentCheckoutFxRate();
    const rows = await this.prisma.esimAiraloPackage.findMany({
      where: {
        lifecycle: EsimCatalogLifecycle.PUBLISHED,
        variant: {
          status: 'ACTIVE',
          deletedAt: null,
          type: 'ESIM',
          product: { homeService: 'ESIM', status: 'ACTIVE', deletedAt: null },
          providerMappings: {
            some: {
              status: 'ACTIVE',
              availability: 'AVAILABLE',
              provider: { code: ESIM_AIRALO_PROVIDER_CODE, deletedAt: null },
            },
          },
        },
      },
      include: {
        variant: {
          include: {
            product: { select: { id: true, slug: true, name: true } },
          },
        },
      },
    });

    return rows
      .map((row) =>
        row.variant
          ? this.toOffer(
              row.variant.product,
              row.variant,
              {
                countryIso: row.countryIso,
                destinationKey: row.destinationKey,
              },
              language,
              fxRate,
            )
          : null,
      )
      .filter((offer): offer is EsimPublicOffer => offer !== null)
      .sort(
        (a, b) =>
          a.countryIso.localeCompare(b.countryIso) ||
          a.title.localeCompare(b.title, language === 'en' ? 'en' : 'vi'),
      );
  }

  private toOffer(
    product: { id: string; slug: string; name: string },
    variant: { id: string; sku: string; name: string; sellPrice: { toString(): string }; metadata: unknown },
    row: { countryIso: string; destinationKey: string },
    locale: StorefrontLocale,
    fxRate: string | null,
  ): EsimPublicOffer | null {
    const facts = readFacts(variant.metadata);
    if (!facts?.publicSlug) return null;
    const sellPriceVnd = Math.round(Number(variant.sellPrice.toString()));
    if (!Number.isFinite(sellPriceVnd) || sellPriceVnd <= 0) return null;
    const charge = displayChargeForOffer({
      market: marketFromEsimPackage(row),
      sellPriceVnd,
      fxRate,
    });
    const speedLabel = (facts.speed ?? []).join('/');
    const operators = hideSupplierTokens(facts.operators);
    const providerDescription = hideSupplierBrand(facts.shortInfo || facts.providerDescription || '');
    const countryIso = facts.countryIso ?? displayIso(row.destinationKey, row.countryIso);
    const copy = presentStorefrontOfferText({
      locale,
      destinationKey: row.destinationKey,
      countryIso,
      storedCountryName: facts.countryName,
      dataAmountMb: facts.dataAmountMb ?? 0,
      unlimited: facts.unlimited === true || (facts.dataAmountMb ?? 0) < 0,
      duration: facts.duration ?? 0,
      durationUnit: facts.durationUnit,
      speedLabel,
      operators,
      activationPolicy: facts.activationPolicy ?? '',
      storedActivationLabel: facts.activationLabel,
      title: variant.name,
      productName: product.name,
      providerDescription,
    });
    return {
      id: facts.publicSlug,
      variantId: variant.id,
      productId: product.id,
      productSlug: product.slug,
      productName: copy.productName,
      sku: variant.sku,
      title: copy.title,
      providerDescription: displayProviderText(providerDescription, locale),
      summary: copy.summary,
      dataLabel: copy.dataLabel,
      durationLabel: copy.durationLabel,
      speedLabel,
      operators,
      groupLabel: facts.group ?? '',
      sellPriceVnd,
      market: charge.market,
      chargeCurrency: charge.chargeCurrency,
      chargeAmount: charge.chargeAmount,
      fxRate: charge.fxRate,
      countryIso,
      countryName: copy.countryName,
      testData: false,
      photo: facts.countryImageUrl || null,
      operatorInfo: hideSupplierTokens(facts.operatorInfo)
        .map((item) => displayProviderText(item, locale))
        .filter(Boolean),
      shortInfo: displayProviderText(hideSupplierBrand(facts.shortInfo ?? ''), locale),
      otherInfo: displayProviderText(hideSupplierBrand(facts.otherInfo ?? ''), locale),
      activationPolicy: facts.activationPolicy ?? '',
      activationLabel: copy.activationLabel,
      apnType: facts.apnType ?? '',
      apnValue: facts.apnValue ?? '',
      isRoaming: facts.isRoaming === true,
      rechargeable: facts.rechargeable === true,
      networks: hideSupplierTokens(facts.networks),
      countryImageUrl: facts.countryImageUrl ?? '',
      operatorImageUrl: facts.operatorImageUrl ?? '',
      fairUsagePolicy: displayProviderText(hideSupplierBrand(facts.fairUsagePolicy ?? ''), locale),
    };
  }

  /** Same EFFECTIVE rate quote() uses. The Airalo import rate is not a checkout rate. */
  private async currentCheckoutFxRate(): Promise<string | null> {
    const rows = await this.prisma.fxRate.findMany({
      where: { sourceCode: MANUAL_USD_VND_SOURCE },
      include: { source: true },
    });
    const selected = selectCheckoutFx(
      rows.map((rate) => ({
        id: rate.id,
        status: rate.status,
        rate: rate.rate,
        observedAt: rate.observedAt,
        effectiveFrom: rate.effectiveFrom,
        effectiveTo: rate.effectiveTo,
        maxStalenessSeconds: rate.source.maxStalenessSeconds,
        baseCurrency: rate.source.baseCurrency,
        quoteCurrency: rate.source.quoteCurrency,
      })),
      new Date(),
    );
    return selected.ok ? selected.rate.toString() : null;
  }
}

function hideSupplierBrand(value: string): string {
  return value.replace(/Airalo/gi, 'Keyon');
}

function hideSupplierTokens(values: string[] | undefined): string[] {
  return (values ?? [])
    .map((value) => value.replace(/Airalo/gi, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function displayIso(destinationKey: string, countryIso: string): string {
  if (destinationKey === 'asia') return 'ASIA';
  if (destinationKey === 'europe') return 'EUROPE';
  return countryIso.toUpperCase() || destinationKey.toUpperCase();
}

function readFacts(metadata: unknown): CatalogueFacts | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const catalogue = (metadata as { catalogue?: unknown }).catalogue;
  if (!catalogue || typeof catalogue !== 'object') return null;
  return catalogue as CatalogueFacts;
}

