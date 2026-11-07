import { FulfillmentStatus, OrderEventType, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

/** Persisted by EsimOrderService for a SUPER_ADMIN test order. Not a request field. */
export function isPersistedAdminTest(clientTrace: unknown): boolean {
  if (!clientTrace || typeof clientTrace !== 'object' || Array.isArray(clientTrace)) return false;
  return (clientTrace as Record<string, unknown>).adminTest === true;
}

const ADMIN_TEST_USD = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

export type AdminTestCharge = {
  currency: 'USD';
  amount: string;
  mode: 'sandbox';
  catalogCurrency: 'VND';
  catalogSellAmountVnd: string;
};

/**
 * Blank means the sandbox default of 1.00 USD.
 * Accepts 0.01 through 80.00 with at most two decimal places.
 */
export function parseAdminTestAmountUsd(
  raw: unknown,
): { ok: true; amount: string } | { ok: false } {
  if (raw === undefined || raw === null || raw === '') {
    return { ok: true, amount: '1.00' };
  }
  if (typeof raw !== 'string') return { ok: false };
  const text = raw.trim();
  if (!ADMIN_TEST_USD.test(text)) return { ok: false };
  let amount: Decimal;
  try {
    amount = new Decimal(text);
  } catch {
    return { ok: false };
  }
  if (!amount.isFinite() || amount.lt('0.01') || amount.gt('80')) return { ok: false };
  return { ok: true, amount: amount.toFixed(2) };
}

export function formatCatalogVnd(amount: Decimal | string | number): string {
  const fixed = new Decimal(amount).toDecimalPlaces(2).toFixed(2);
  return fixed.endsWith('.00') ? new Decimal(fixed).toFixed(0) : fixed;
}

/** Charge written by createAdminTest. A client-supplied object is ignored unless it matches this shape. */
export function readAdminTestCharge(clientTrace: unknown): AdminTestCharge | null {
  if (!isPersistedAdminTest(clientTrace)) return null;
  const raw = (clientTrace as Record<string, unknown>).adminTestCharge;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const charge = raw as Record<string, unknown>;
  const parsed = parseAdminTestAmountUsd(
    typeof charge.amount === 'string' ? charge.amount : undefined,
  );
  if (!parsed.ok || charge.amount !== parsed.amount) return null;
  if (charge.currency !== 'USD' || charge.mode !== 'sandbox' || charge.catalogCurrency !== 'VND') {
    return null;
  }
  if (typeof charge.catalogSellAmountVnd !== 'string' || !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(charge.catalogSellAmountVnd)) {
    return null;
  }
  return {
    currency: 'USD',
    amount: parsed.amount,
    mode: 'sandbox',
    catalogCurrency: 'VND',
    catalogSellAmountVnd: charge.catalogSellAmountVnd,
  };
}

export function readAdminTestFulfillmentSkip(clientTrace: unknown): boolean {
  if (!clientTrace || typeof clientTrace !== 'object' || Array.isArray(clientTrace)) return false;
  const marker = (clientTrace as Record<string, unknown>).adminTestFulfillment;
  if (!marker || typeof marker !== 'object' || Array.isArray(marker)) return false;
  return (marker as Record<string, unknown>).status === 'SKIPPED';
}

type SkipStore = {
  order: {
    findUnique(args: unknown): Promise<{ clientTrace: Prisma.JsonValue; fulfillmentStatus: FulfillmentStatus } | null>;
    update(args: unknown): Promise<unknown>;
  };
  orderEvent: {
    create(args: unknown): Promise<unknown>;
  };
};

/**
 * Records that an admin-test eSIM order was paid and fulfillment was skipped.
 * Returns false when the stored trace is not an admin test. Does not call a provider.
 */
export async function persistAdminTestFulfillmentSkip(
  db: SkipStore,
  orderId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { clientTrace: true, fulfillmentStatus: true },
  });
  if (!order || !isPersistedAdminTest(order.clientTrace)) return false;
  if (readAdminTestFulfillmentSkip(order.clientTrace)) return true;

  const trace = { ...(order.clientTrace as Record<string, unknown>) };
  trace.adminTestFulfillment = {
    status: 'SKIPPED',
    reason: 'ADMIN_TEST',
    at: now.toISOString(),
  };
  const canMark =
    order.fulfillmentStatus === FulfillmentStatus.PENDING ||
    order.fulfillmentStatus === FulfillmentStatus.PROCESSING;
  await db.order.update({
    where: { id: orderId },
    data: {
      clientTrace: trace as Prisma.InputJsonValue,
      ...(canMark ? { fulfillmentStatus: FulfillmentStatus.NEED_MANUAL_REVIEW } : {}),
    },
  });
  await db.orderEvent.create({
    data: {
      orderId,
      eventType: OrderEventType.ORDER_NEED_SUPPORT,
      message: 'Admin test payment succeeded. eSIM fulfillment skipped on purpose.',
      metadata: { adminTestFulfillment: 'SKIPPED', reason: 'ADMIN_TEST' },
    },
  });
  return true;
}
