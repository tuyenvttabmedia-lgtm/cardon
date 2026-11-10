import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ProductVariantType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ACTIVE_ORDER_WHERE } from '../order/entities/order.constants';
import { AiraloRequestError, EsimAiraloAdapter } from './esim-airalo.adapter';

export interface EsimTopupPackageView {
  providerPackageId: string;
  title: string;
  dataAmountMb: number | null;
  validityDays: number | null;
  price: number | null;
  currency: string | null;
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
 * Airalo eSIM top-up (checklist item 4). Uses partner credit on sandbox/ops paths.
 * Customer-paid storefront top-up can wrap this later with a paid checkout.
 */
@Injectable()
export class EsimTopupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly airalo: EsimAiraloAdapter,
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
    try {
      const packages = await this.airalo.listTopupPackages(profile.iccid);
      return { iccid: profile.iccid, packages };
    } catch (error) {
      throw this.mapAiraloError(error, 'list top-up packages');
    }
  }

  async listForIccid(iccid: string): Promise<{ iccid: string; packages: EsimTopupPackageView[] }> {
    const trimmed = this.requireIccid(iccid);
    try {
      const packages = await this.airalo.listTopupPackages(trimmed);
      return { iccid: trimmed, packages };
    } catch (error) {
      throw this.mapAiraloError(error, 'list top-up packages');
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
      return new BadRequestException(`Airalo ${action} failed: ${error.message}`);
    }
    return error instanceof Error ? error : new BadRequestException(`Airalo ${action} failed`);
  }
}
