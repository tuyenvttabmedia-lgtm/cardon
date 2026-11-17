import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { ProductVariantType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ACTIVE_ORDER_WHERE } from '../order/entities/order.constants';
import { SettingsStoreService } from '../settings/services/settings-store.service';
import { AiraloRequestError, EsimAiraloAdapter } from './esim-airalo.adapter';
import {
  costVndFromAiralo,
  retailVndFromAiralo,
  sellPriceFromAiralo,
} from './esim-catalogue.rules';
import { parseAiraloUsageBody, type EsimUsageSnapshot } from './esim-usage.rules';

export interface EsimTopupPackageView {
  providerPackageId: string;
  title: string;
  dataAmountMb: number | null;
  validityDays: number | null;
  price: number | null;
  currency: string | null;
  netPriceUsd: number | null;
  netPriceVnd: number | null;
  retailPriceUsd: number | null;
  retailPriceVnd: number | null;
  costVnd: number;
  sellPriceVnd: number;
  dataLabel: string | null;
  validityLabel: string | null;
}

export interface EsimTopupSubmitResult {
  orderReference: string | undefined;
  providerOrderId: string | undefined;
  providerOrderCode: string | undefined;
  status: string | undefined;
  iccid: string;
  packageId: string;
}

/**
 * Airalo eSIM top-up + usage. Ops can submit on partner credit;
 * customer-paid checkout wraps list/pricing then fulfills after PAID.
 */
@Injectable()
export class EsimTopupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly airalo: EsimAiraloAdapter,
    @Optional() private readonly settings?: SettingsStoreService,
  ) {}

  async listForOrder(orderId: string, userId?: string): Promise<{
    iccid: string;
    packages: EsimTopupPackageView[];
  }> {
    const profile = await this.loadProfile(orderId, userId);
    if (!profile.iccid) {
      throw new BadRequestException(
        'eSIM profile has no ICCID yet. Recover install details from Airalo before top-up.',
      );
    }
    return this.listForIccid(profile.iccid);
  }

  async listForIccid(iccid: string): Promise<{ iccid: string; packages: EsimTopupPackageView[] }> {
    const trimmed = this.requireIccid(iccid);
    try {
      const packages = await this.airalo.listTopupPackages(trimmed);
      const usdVndRate = this.settings?.resolveAiraloUsdVndRate() ?? 26_000;
      return {
        iccid: trimmed,
        packages: packages.map((pack) => this.pricePackage(pack, usdVndRate)),
      };
    } catch (error) {
      throw this.mapAiraloError(error, 'list top-up packages');
    }
  }

  async usageForOrder(orderId: string, userId?: string): Promise<{
    iccid: string;
    usage: EsimUsageSnapshot | null;
  }> {
    const profile = await this.loadProfile(orderId, userId);
    if (!profile.iccid) {
      throw new BadRequestException('eSIM profile has no ICCID yet');
    }
    try {
      const body = await this.airalo.getSimUsage(profile.iccid);
      return { iccid: profile.iccid, usage: parseAiraloUsageBody(body) };
    } catch (error) {
      throw this.mapAiraloError(error, 'get usage');
    }
  }

  async submitForOrder(
    orderId: string,
    packageId: string,
    userId?: string,
  ): Promise<EsimTopupSubmitResult> {
    const profile = await this.loadProfile(orderId, userId);
    if (!profile.iccid) {
      throw new BadRequestException(
        'eSIM profile has no ICCID yet. Recover install details from Airalo before top-up.',
      );
    }
    return this.submit(profile.iccid, packageId, `cardon-order-${orderId}`);
  }

  async submit(iccid: string, packageId: string, description?: string): Promise<EsimTopupSubmitResult> {
    const trimmedIccid = this.requireIccid(iccid);
    const trimmedPackage = packageId.trim();
    if (!trimmedPackage) {
      throw new BadRequestException('packageId is required');
    }
    try {
      const result = await this.airalo.submitTopupOrder({
        iccid: trimmedIccid,
        packageId: trimmedPackage,
        description,
      });
      return {
        orderReference: result.orderReference,
        providerOrderId: result.providerOrderId,
        providerOrderCode: result.providerOrderCode,
        status: result.status,
        iccid: trimmedIccid,
        packageId: trimmedPackage,
      };
    } catch (error) {
      throw this.mapAiraloError(error, 'submit top-up');
    }
  }

  private pricePackage(
    pack: {
      providerPackageId: string;
      title: string;
      dataAmountMb: number | null;
      validityDays: number | null;
      price: number | null;
      currency: string | null;
      netPriceUsd: number | null;
      netPriceVnd: number | null;
      retailPriceUsd: number | null;
      retailPriceVnd: number | null;
    },
    usdVndRate: number,
  ): EsimTopupPackageView {
    const cost = costVndFromAiralo({
      netPriceVnd: pack.netPriceVnd,
      netPriceUsd: pack.netPriceUsd ?? pack.price,
      usdVndRate,
    });
    const retailVnd = retailVndFromAiralo({
      retailPriceVnd: pack.retailPriceVnd,
      retailPriceUsd: pack.retailPriceUsd,
      usdVndRate,
    });
    const sellPriceVnd = sellPriceFromAiralo(cost.costVnd, retailVnd);
    return {
      providerPackageId: pack.providerPackageId,
      title: pack.title,
      dataAmountMb: pack.dataAmountMb,
      validityDays: pack.validityDays,
      price: pack.price,
      currency: pack.currency,
      netPriceUsd: pack.netPriceUsd,
      netPriceVnd: pack.netPriceVnd,
      retailPriceUsd: pack.retailPriceUsd,
      retailPriceVnd: pack.retailPriceVnd,
      costVnd: cost.costVnd,
      sellPriceVnd,
      dataLabel: pack.dataAmountMb != null ? formatDataMb(pack.dataAmountMb) : null,
      validityLabel: pack.validityDays != null ? `${pack.validityDays} ngày` : null,
    };
  }

  private requireIccid(iccid: string): string {
    const trimmed = iccid.trim();
    if (trimmed.length < 10 || trimmed.length > 32) {
      throw new BadRequestException('Invalid ICCID');
    }
    if (!/^\d+$/.test(trimmed)) {
      throw new BadRequestException('Invalid ICCID');
    }
    return trimmed;
  }

  private async loadProfile(orderId: string, userId?: string) {
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        ...ACTIVE_ORDER_WHERE,
        ...(userId ? { userId } : {}),
        orderItems: { some: { variant: { type: ProductVariantType.ESIM } } },
      },
      select: {
        orderItems: {
          where: { variant: { type: ProductVariantType.ESIM } },
          select: { esimProfile: { select: { iccid: true } } },
          take: 1,
        },
      },
    });
    if (!order) throw new NotFoundException('eSIM order not found');
    const profile = order.orderItems[0]?.esimProfile;
    if (!profile) throw new NotFoundException('eSIM profile not found');
    return profile;
  }

  private mapAiraloError(error: unknown, action: string): Error {
    if (error instanceof BadRequestException || error instanceof NotFoundException) {
      return error;
    }
    if (error instanceof AiraloRequestError) {
      if (error.status === 404 || error.airaloCode === 34 || /iccid/i.test(error.message)) {
        return new BadRequestException(`Airalo rejected ICCID during ${action}`);
      }
      if (error.status === 429) {
        return new BadRequestException('Airalo usage rate limit — thử lại sau ít phút');
      }
      return new BadRequestException(`Airalo ${action} failed: ${error.message}`);
    }
    return error instanceof Error ? error : new BadRequestException(`Airalo ${action} failed`);
  }
}

function formatDataMb(mb: number): string {
  if (mb >= 1024 && mb % 1024 === 0) return `${mb / 1024} GB`;
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}
