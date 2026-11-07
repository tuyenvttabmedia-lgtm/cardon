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
import { buildEsimPackageSpec } from './esim-package-spec';
import { SettingsStoreService } from '../settings/services/settings-store.service';

export interface EsimAccountRow extends EsimDeliveryView {
  id: string | null;
  orderId: string;
  orderCode: string;
  createdAt: string;
}

@Injectable()
export class EsimAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: CardEncryptionService,
    @Optional() private readonly settings?: SettingsStoreService,
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
        orderItems: {
          where: { variant: { type: ProductVariantType.ESIM } },
          select: {
            variant: { select: { name: true, product: { select: { name: true } } } },
            esimQuote: { select: { providerProductCode: true } },
            esimProfile: { select: { id: true, createdAt: true, installSecretEnc: true } },
          },
        },
      },
    });

    const packages = await this.loadPackageMap(
      orders.flatMap((order) =>
        order.orderItems.map((item) => item.esimQuote?.providerProductCode).filter(Boolean) as string[],
      ),
    );

    return orders.flatMap((order) => {
      const item = order.orderItems[0];
      if (!item) return [];
      return [
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
          packageRow: item.esimQuote?.providerProductCode
            ? packages.get(item.esimQuote.providerProductCode)
            : undefined,
        }),
      ];
    });
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
        orderItems: {
          where: { variant: { type: ProductVariantType.ESIM } },
          select: {
            variant: { select: { name: true, product: { select: { name: true } } } },
            esimQuote: { select: { providerProductCode: true } },
            esimProfile: { select: { id: true, createdAt: true, installSecretEnc: true } },
          },
        },
      },
    });
    const item = order?.orderItems[0];
    if (!order || !item) {
      throw new NotFoundException('eSIM profile not found');
    }
    const packages = await this.loadPackageMap(
      item.esimQuote?.providerProductCode ? [item.esimQuote.providerProductCode] : [],
    );
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
      packageRow: item.esimQuote?.providerProductCode
        ? packages.get(item.esimQuote.providerProductCode)
        : undefined,
    });
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
    });
    return {
      ...view,
      id: input.id,
      orderId: input.orderId,
      orderCode: input.orderCode,
      createdAt: input.createdAt,
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
