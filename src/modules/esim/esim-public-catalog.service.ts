import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EsimCatalogLifecycle } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { SettingsStoreService } from '../settings/services/settings-store.service';
import { ESIM_AIRALO_PROVIDER_CODE } from './esim.constants';
import { activationLabelVi, COUNTRY_NAMES_VI } from './esim-catalogue.rules';
import { evaluateEsimSale, esimSaleFlagsFromRuntime } from './esim-policy';

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

  async listStorefront(): Promise<EsimStorefrontCatalog> {
    const offers = await this.listPublicOffers();
    return { salesOpen: this.salesOpen(), offers };
  }

  async listPublicOffers(): Promise<EsimPublicOffer[]> {
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
          ? this.toOffer(row.variant.product, row.variant, {
              countryIso: row.countryIso,
              destinationKey: row.destinationKey,
            })
          : null,
      )
      .filter((offer): offer is EsimPublicOffer => offer !== null)
      .sort((a, b) => a.countryIso.localeCompare(b.countryIso) || a.title.localeCompare(b.title, 'vi'));
  }

  private toOffer(
    product: { id: string; slug: string; name: string },
    variant: { id: string; sku: string; name: string; sellPrice: { toString(): string }; metadata: unknown },
    row: { countryIso: string; destinationKey: string },
  ): EsimPublicOffer | null {
    const facts = readFacts(variant.metadata);
    if (!facts?.publicSlug) return null;
    const sellPriceVnd = Math.round(Number(variant.sellPrice.toString()));
    if (!Number.isFinite(sellPriceVnd) || sellPriceVnd <= 0) return null;
    const dataLabel = facts.unlimited || (facts.dataAmountMb ?? 0) < 0
      ? 'Không giới hạn'
      : formatData(facts.dataAmountMb ?? 0);
    const durationLabel = formatDuration(facts.duration ?? 0, facts.durationUnit);
    const speedLabel = (facts.speed ?? []).join('/');
    const operators = hideSupplierTokens(facts.operators);
    const providerDescription = hideSupplierBrand(facts.shortInfo || facts.providerDescription || '');
    const countryIso = facts.countryIso ?? displayIso(row.destinationKey, row.countryIso);
    const countryName =
      COUNTRY_NAMES_VI[row.destinationKey] ??
      COUNTRY_NAMES_VI[countryIso] ??
      facts.countryName ??
      countryIso;
    const activationLabel = facts.activationLabel || activationLabelVi(facts.activationPolicy ?? '');
    const summary = [
      `${dataLabel}, ${durationLabel}, ${countryName}.`,
      speedLabel ? `Tốc độ: ${speedLabel}.` : '',
      operators.length > 0 ? `Nhà mạng: ${operators.join(', ')}.` : '',
      activationLabel,
      providerDescription,
    ].filter(Boolean).join(' ');
    return {
      id: facts.publicSlug,
      variantId: variant.id,
      productId: product.id,
      productSlug: product.slug,
      productName: product.name,
      sku: variant.sku,
      title: variant.name,
      providerDescription,
      summary,
      dataLabel,
      durationLabel,
      speedLabel,
      operators,
      groupLabel: facts.group ?? '',
      sellPriceVnd,
      countryIso,
      countryName,
      testData: false,
      photo: facts.countryImageUrl || null,
      operatorInfo: hideSupplierTokens(facts.operatorInfo),
      shortInfo: hideSupplierBrand(facts.shortInfo ?? ''),
      otherInfo: hideSupplierBrand(facts.otherInfo ?? ''),
      activationPolicy: facts.activationPolicy ?? '',
      activationLabel,
      apnType: facts.apnType ?? '',
      apnValue: facts.apnValue ?? '',
      isRoaming: facts.isRoaming === true,
      rechargeable: facts.rechargeable === true,
      networks: hideSupplierTokens(facts.networks),
      countryImageUrl: facts.countryImageUrl ?? '',
      operatorImageUrl: facts.operatorImageUrl ?? '',
      fairUsagePolicy: hideSupplierBrand(facts.fairUsagePolicy ?? ''),
    };
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

function formatData(amountMb: number): string {
  if (amountMb >= 1024 && amountMb % 1024 === 0) return `${amountMb / 1024} GB`;
  if (amountMb >= 1000 && amountMb % 1000 === 0) return `${amountMb / 1000} GB`;
  return `${amountMb} MB`;
}

function formatDuration(duration: number, unit: string | undefined): string {
  if (unit === 'day') return `${duration} ngày`;
  return `${duration} ${unit ?? ''}`.trim();
}
