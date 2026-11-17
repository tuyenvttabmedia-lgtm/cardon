import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { FulfillmentStatus, OrderPaymentStatus, ProductVariantType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CardEncryptionService } from '../provider/services/card-encryption.service';
import { ACTIVE_ORDER_WHERE } from '../order/entities/order.constants';
import {
  buildEsimDelivery,
  destinationFromNames,
  type EsimDeliveryKind,
  type EsimDeliveryView,
  isInstallableLpa,
  resolveEsimDeliveryKind,
} from './esim-delivery.view';
import { EsimAiraloAdapter } from './esim-airalo.adapter';
import { buildEsimPackageSpec } from './esim-package-spec';
import { SettingsStoreService } from '../settings/services/settings-store.service';
import { maskEsimIccid, readEsimTopupTrace } from './esim-usage.rules';

export interface EsimAccountRow extends EsimDeliveryView {
  id: string | null;
  orderId: string;
  orderCode: string;
  createdAt: string;
  iccidMasked: string | null;
  hasIccid: boolean;
  topupSupported: boolean;
}

@Injectable()
export class EsimAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: CardEncryptionService,
    @Optional() private readonly settings?: SettingsStoreService,
    @Optional() private readonly airalo?: EsimAiraloAdapter,
  ) {}

  async listForUser(userId: string): Promise<EsimAccountRow[]> {
    const orders = await this.prisma.order.findMany({
      where: {
        userId,
        ...ACTIVE_ORDER_WHERE,
        paymentStatus: OrderPaymentStatus.PAID,
        orderItems: { some: { variant: { type: ProductVariantType.ESIM } } },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orderCode: true,
        createdAt: true,
        paymentStatus: true,
        fulfillmentStatus: true,
        clientTrace: true,
        orderItems: {
          where: { variant: { type: ProductVariantType.ESIM } },
          select: {
            variant: { select: { name: true, product: { select: { name: true } } } },
            esimQuote: { select: { providerProductCode: true } },
            esimProfile: {
              select: {
                id: true,
                createdAt: true,
                installSecretEnc: true,
                iccid: true,
                sharingLink: true,
                sharingAccessCode: true,
              },
            },
          },
        },
      },
    });

    // Filter top-up child orders in app code. Prisma JSON `NOT path=equals` drops
    // rows where the path is missing (SQL NULL), which hid every normal eSIM.
    const simOrders = orders.filter((order) => !readEsimTopupTrace(order.clientTrace));

    const packages = await this.loadPackageMap(
      simOrders.flatMap((order) =>
        order.orderItems.map((item) => item.esimQuote?.providerProductCode).filter(Boolean) as string[],
      ),
    );

    const rows: EsimAccountRow[] = [];
    for (const order of simOrders) {
      const item = order.orderItems[0];
      if (!item) continue;
      const sharing = await this.ensureSharing(item.esimProfile);
      rows.push(
        this.toRow({
          id: item.esimProfile?.id ?? null,
          orderId: order.id,
          orderCode: order.orderCode,
          createdAt: (item.esimProfile?.createdAt ?? order.createdAt).toISOString(),
          paymentStatus: order.paymentStatus,
          fulfillmentStatus: order.fulfillmentStatus,
          productName: item.variant.product.name,
          variantName: item.variant.name,
          installSecretEnc: item.esimProfile?.installSecretEnc ?? null,
          iccid: item.esimProfile?.iccid ?? null,
          sharingLink: sharing.sharingLink,
          sharingAccessCode: sharing.sharingAccessCode,
          packageRow: item.esimQuote?.providerProductCode
            ? packages.get(item.esimQuote.providerProductCode)
            : undefined,
        }),
      );
    }
    return rows;
  }

  async getForUser(userId: string, orderId: string): Promise<EsimAccountRow> {
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        userId,
        ...ACTIVE_ORDER_WHERE,
        orderItems: { some: { variant: { type: ProductVariantType.ESIM } } },
      },
      select: {
        id: true,
        orderCode: true,
        createdAt: true,
        paymentStatus: true,
        fulfillmentStatus: true,
        clientTrace: true,
        orderItems: {
          where: { variant: { type: ProductVariantType.ESIM } },
          select: {
            variant: { select: { name: true, product: { select: { name: true } } } },
            esimQuote: { select: { providerProductCode: true } },
            esimProfile: {
              select: {
                id: true,
                createdAt: true,
                installSecretEnc: true,
                iccid: true,
                sharingLink: true,
                sharingAccessCode: true,
              },
            },
          },
        },
      },
    });
    const item = order?.orderItems[0];
    if (!order || !item || readEsimTopupTrace(order.clientTrace)) {
      throw new NotFoundException('eSIM profile not found');
    }
    const packages = await this.loadPackageMap(
      item.esimQuote?.providerProductCode ? [item.esimQuote.providerProductCode] : [],
    );
    const sharing = await this.ensureSharing(item.esimProfile);
    return this.toRow({
      id: item.esimProfile?.id ?? null,
      orderId: order.id,
      orderCode: order.orderCode,
      createdAt: (item.esimProfile?.createdAt ?? order.createdAt).toISOString(),
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      productName: item.variant.product.name,
      variantName: item.variant.name,
      installSecretEnc: item.esimProfile?.installSecretEnc ?? null,
      iccid: item.esimProfile?.iccid ?? null,
      sharingLink: sharing.sharingLink,
      sharingAccessCode: sharing.sharingAccessCode,
      packageRow: item.esimQuote?.providerProductCode
        ? packages.get(item.esimQuote.providerProductCode)
        : undefined,
    });
  }

  /** Persist Airalo Cloud share for older profiles that only stored LPA/ICCID. */
  private async ensureSharing(
    profile:
      | {
          id: string;
          iccid: string | null;
          sharingLink: string | null;
          sharingAccessCode: string | null;
        }
      | null
      | undefined,
  ): Promise<{ sharingLink: string | null; sharingAccessCode: string | null }> {
    if (!profile) return { sharingLink: null, sharingAccessCode: null };
    if (profile.sharingLink?.startsWith('https://') && profile.sharingAccessCode?.trim()) {
      return {
        sharingLink: profile.sharingLink,
        sharingAccessCode: profile.sharingAccessCode.trim(),
      };
    }
    if (!profile.iccid || !this.airalo?.getSim) {
      return {
        sharingLink: profile.sharingLink,
        sharingAccessCode: profile.sharingAccessCode,
      };
    }
    try {
      const sim = await this.airalo.getSim(profile.iccid);
      if (!sim.sharingLink?.startsWith('https://') || !sim.sharingAccessCode?.trim()) {
        return {
          sharingLink: profile.sharingLink,
          sharingAccessCode: profile.sharingAccessCode,
        };
      }
      const sharingLink = sim.sharingLink.trim();
      const sharingAccessCode = sim.sharingAccessCode.trim().slice(0, 32);
      await this.prisma.esimProfile
        .update({ where: { id: profile.id }, data: { sharingLink, sharingAccessCode } })
        .catch(() => undefined);
      return { sharingLink, sharingAccessCode };
    } catch {
      return {
        sharingLink: profile.sharingLink,
        sharingAccessCode: profile.sharingAccessCode,
      };
    }
  }

  private toRow(input: {
    id: string | null;
    orderId: string;
    orderCode: string;
    createdAt: string;
    paymentStatus: OrderPaymentStatus;
    fulfillmentStatus: FulfillmentStatus;
    productName?: string | null;
    variantName?: string | null;
    installSecretEnc: string | null;
    iccid?: string | null;
    sharingLink?: string | null;
    sharingAccessCode?: string | null;
    packageRow?: Parameters<typeof buildEsimPackageSpec>[0];
  }): EsimAccountRow {
    let secret: string | null = null;
    if (input.installSecretEnc) {
      try {
        const decrypted = this.encryption.decrypt(input.installSecretEnc);
        secret = isInstallableLpa(decrypted) ? decrypted : null;
      } catch {
        secret = null;
      }
    }
    const kind: EsimDeliveryKind = resolveEsimDeliveryKind({
      isEsim: true,
      paymentStatus: input.paymentStatus,
      fulfillmentStatus: input.fulfillmentStatus,
      hasValidSecret: Boolean(secret),
    });
    const view = buildEsimDelivery({
      kind,
      destination: destinationFromNames(input.productName, input.variantName),
      packageName: input.variantName ?? input.productName ?? null,
      secret,
      includeSecrets: false,
      packageSpec: buildEsimPackageSpec(input.packageRow, input.variantName ?? input.productName),
      sandboxAccount: this.settings?.resolveAiraloAccountMode() !== 'production',
      orderId: input.orderId,
      orderCode: input.orderCode,
      sharingLink: input.sharingLink,
      sharingAccessCode: input.sharingAccessCode,
    });
    const iccidMasked = maskEsimIccid(input.iccid);
    return {
      ...view,
      id: input.id,
      orderId: input.orderId,
      orderCode: input.orderCode,
      createdAt: input.createdAt,
      iccidMasked,
      hasIccid: Boolean(input.iccid && input.iccid.trim().length >= 10),
      topupSupported: Boolean(input.iccid && input.iccid.trim().length >= 10 && kind === 'ready'),
    };
  }

  private async loadPackageMap(codes: string[]) {
    const unique = [...new Set(codes.filter(Boolean))];
    if (unique.length === 0 || !this.prisma.esimAiraloPackage?.findMany) {
      return new Map();
    }
    const rows = await this.prisma.esimAiraloPackage.findMany({
      where: { providerPackageId: { in: unique } },
      select: {
        providerPackageId: true,
        title: true,
        dataAmountMb: true,
        isUnlimited: true,
        validityDays: true,
        fupClear: true,
        lifecycle: true,
        rawSafeMeta: true,
        variant: { select: { name: true, metadata: true } },
      },
    });
    return new Map(rows.map((row) => [row.providerPackageId, row]));
  }
}
