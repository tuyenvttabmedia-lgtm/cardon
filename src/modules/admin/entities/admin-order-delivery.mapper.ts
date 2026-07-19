import {
  CardRecord,
  Order,
  OrderItem,
  ProductVariant,
  ProductVariantType,
  ProviderTransaction,
  TopupTransaction,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { CardRecordStatus } from '@prisma/client';
import { decimalToString } from '../../order/entities/order.mapper';
import { canAdminViewPin, maskPinDisplay, maskPinPartial } from './card-pin.util';

export type AdminDeliveryType = 'CARD' | 'TOPUP' | 'DATA';

export interface AdminDeliveryItemView {
  id: string;
  cardId?: string;
  productName: string;
  faceValue: string;
  quantity?: number;
  serial: string | null;
  pin: string | null;
  pinMasked: string | null;
  expiredAt: string | null;
  providerName: string | null;
  providerTransactionId: string | null;
  deliveredAt: string | null;
  phoneNumber?: string | null;
  telco?: string | null;
  packageName?: string | null;
  status?: string;
}

export interface AdminDeliveryView {
  type: AdminDeliveryType;
  productName: string | null;
  faceValue: string | null;
  quantity: number | null;
  items: AdminDeliveryItemView[];
}

type OrderItemRow = OrderItem & {
  variant?: Pick<ProductVariant, 'sku' | 'name' | 'type'> | null;
  cardRecords: CardRecord[];
};

type DeliveryOrderRow = Pick<Order, 'id'> & {
  orderItems: OrderItemRow[];
  topupTransactions: TopupTransaction[];
  providerTransactions: (ProviderTransaction & { provider?: { code: string; name: string } | null })[];
};

function itemFaceValueSnapshot(item: OrderItem): string {
  const unit = new Decimal(item.unitPrice);
  const perUnitDiscount = new Decimal(item.discount).div(item.quantity || 1);
  return decimalToString(unit.add(perUnitDiscount));
}

function extractExpiredAt(providerResponse: unknown): string | null {
  if (!providerResponse || typeof providerResponse !== 'object' || Array.isArray(providerResponse)) {
    return null;
  }
  const raw = (providerResponse as Record<string, unknown>).expiredAt;
  if (typeof raw === 'string') return raw;
  if (raw instanceof Date) return raw.toISOString();
  return null;
}

function resolveProviderName(
  providerTransactions: DeliveryOrderRow['providerTransactions'],
): string | null {
  const success = providerTransactions.find((tx) => tx.status === 'SUCCESS');
  return success?.provider?.name ?? success?.provider?.code ?? providerTransactions[0]?.provider?.name ?? null;
}

function resolveProviderTransactionId(
  card: CardRecord,
  providerTransactions: DeliveryOrderRow['providerTransactions'],
): string | null {
  const meta =
    card.providerResponse && typeof card.providerResponse === 'object' && !Array.isArray(card.providerResponse)
      ? (card.providerResponse as Record<string, unknown>)
      : {};
  const fromCard =
    (meta.providerTransactionId as string | undefined) ??
    (meta.gatewayTransactionId as string | undefined) ??
    null;
  if (fromCard) return fromCard;
  const success = providerTransactions.find((tx) => tx.status === 'SUCCESS');
  return success?.providerTransactionId ?? success?.providerReference ?? null;
}

function formatPinDisplay(pin: string): string {
  const digits = pin.replace(/\s/g, '');
  return digits.match(/.{1,4}/g)?.join(' ') ?? pin;
}

function resolveDeliveryType(orderItems: OrderItemRow[], topups: TopupTransaction[]): AdminDeliveryType {
  const hasCards = orderItems.some((item) => item.cardRecords.length > 0);
  if (hasCards) return 'CARD';
  if (topups.length > 0) {
    const topupItem = orderItems.find((item) =>
      item.variant?.type === ProductVariantType.DATA || item.variant?.type === ProductVariantType.TOPUP,
    );
    if (topupItem?.variant?.type === ProductVariantType.DATA) return 'DATA';
    return 'TOPUP';
  }
  const firstType = orderItems[0]?.variant?.type;
  if (firstType === ProductVariantType.DATA) return 'DATA';
  if (firstType === ProductVariantType.TOPUP) return 'TOPUP';
  return 'CARD';
}

export function mapAdminOrderDelivery(params: {
  order: DeliveryOrderRow;
  canViewPin: boolean;
  decryptSerial: (encrypted: string) => string;
  decryptPin: (encrypted: string) => string;
}): AdminDeliveryView {
  const { order, canViewPin, decryptSerial, decryptPin } = params;
  const providerName = resolveProviderName(order.providerTransactions);
  const type = resolveDeliveryType(order.orderItems, order.topupTransactions);

  if (type === 'CARD') {
    const cardItems = order.orderItems.filter((item) => item.cardRecords.length > 0);
    const primary = cardItems[0] ?? order.orderItems[0];
    const items: AdminDeliveryItemView[] = [];

    for (const item of cardItems) {
      let cardIndex = 0;
      for (const card of item.cardRecords) {
        cardIndex += 1;
        const pinPlain = card.encryptedPin ? decryptPin(card.encryptedPin) : null;
        const isDelivered = card.status === CardRecordStatus.DELIVERED;
        const canReturnPin = canViewPin && isDelivered && Boolean(pinPlain);
        items.push({
          id: card.id,
          cardId: card.id,
          productName: item.variant?.name ?? '',
          faceValue: itemFaceValueSnapshot(item),
          serial: decryptSerial(card.encryptedSerial),
          pin: canReturnPin && pinPlain ? formatPinDisplay(pinPlain) : null,
          pinMasked: pinPlain
            ? canReturnPin
              ? maskPinPartial(pinPlain)
              : maskPinDisplay()
            : null,
          expiredAt: extractExpiredAt(card.providerResponse),
          providerName,
          providerTransactionId: resolveProviderTransactionId(card, order.providerTransactions),
          deliveredAt:
            card.status === 'DELIVERED' ? card.createdAt.toISOString() : null,
          status: card.status,
        });
      }
    }

    return {
      type,
      productName: primary?.variant?.name ?? null,
      faceValue: primary ? itemFaceValueSnapshot(primary) : null,
      quantity:
        cardItems.reduce((sum, item) => sum + item.cardRecords.length, 0) ||
        primary?.quantity ||
        null,
      items,
    };
  }

  const items: AdminDeliveryItemView[] = order.topupTransactions.map((topup) => {
    const item = order.orderItems.find((row) => row.id === topup.orderItemId);
    return {
      id: topup.id,
      productName: item?.variant?.name ?? '',
      faceValue: item ? itemFaceValueSnapshot(item) : decimalToString(topup.amount),
      phoneNumber: topup.phoneNumber,
      telco: topup.telco,
      packageName: item?.variant?.name ?? null,
      serial: null,
      pin: null,
      pinMasked: null,
      expiredAt: null,
      providerName,
      providerTransactionId: topup.providerReference,
      deliveredAt: topup.status === 'SUCCESS' ? topup.updatedAt.toISOString() : null,
      status: topup.status,
    };
  });

  const primary = order.orderItems.find((item) =>
    order.topupTransactions.some((tx) => tx.orderItemId === item.id),
  ) ?? order.orderItems[0];

  return {
    type,
    productName: primary?.variant?.name ?? null,
    faceValue: primary ? itemFaceValueSnapshot(primary) : null,
    quantity: primary?.quantity ?? null,
    items,
  };
}

export function itemFaceValueFromOrderItem(item: OrderItem): string {
  return itemFaceValueSnapshot(item);
}
