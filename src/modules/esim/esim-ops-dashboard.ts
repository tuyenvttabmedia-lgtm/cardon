import { Decimal } from '@prisma/client/runtime/library';

export type EsimOpsLane = 'commerce' | 'sandbox';
export type EsimOpsPreset = 'today' | '7d' | '30d' | 'custom';

export interface EsimOpsRange {
  from: Date;
  to: Date;
  preset: EsimOpsPreset;
}

export interface EsimOpsDashboardOrder {
  id: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  providerMode: string | null;
  providerProductCode: string | null;
  clientTrace: unknown;
  providerCost: string;
  paymentFeeAmount: string;
}

export interface EsimOpsDashboardPayment {
  orderId: string;
  amount: string;
  gateway: string;
  paidAt: Date | null;
  createdAt: Date;
}

export interface EsimOpsMoneyBucket {
  currency: string;
  gateway: string;
  amount: string;
  payments: number;
}

const SECRET_KEY = /secret|lpa|token|pin|qr|password|install/i;
const VN_TZ = '+07:00';

export function parseEsimOpsIsoDate(raw: string): string | null {
  const value = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const stamp = Date.parse(`${value}T00:00:00${VN_TZ}`);
  return Number.isFinite(stamp) ? value : null;
}

export function esimOpsRange(
  input: { preset?: string; from?: string; to?: string },
  now = new Date(),
): EsimOpsRange {
  const today = vnYmd(now);
  const customFrom = input.from ? parseEsimOpsIsoDate(input.from) : null;
  const customTo = input.to ? parseEsimOpsIsoDate(input.to) : null;
  if (customFrom || customTo) {
    const fromDay = customFrom ?? customTo ?? today;
    const toDay = customTo ?? customFrom ?? today;
    if (fromDay > toDay) {
      throw new Error('from must be on or before to');
    }
    const from = vnStart(fromDay);
    const to = vnStart(shiftCalendarDay(toDay, 1));
    if (to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) {
      throw new Error('range cannot exceed 366 days');
    }
    return { from, to, preset: 'custom' };
  }
  const preset = input.preset === 'today' || input.preset === '30d' ? input.preset : '7d';
  const days = preset === 'today' ? 1 : preset === '30d' ? 30 : 7;
  return {
    from: vnStart(shiftCalendarDay(today, 1 - days)),
    to: vnStart(shiftCalendarDay(today, 1)),
    preset,
  };
}

export function esimOpsLane(input: {
  providerMode?: string | null;
  clientTrace?: unknown;
}): EsimOpsLane {
  const trace = asRecord(input.clientTrace);
  if (trace.adminTest === true || trace.sandbox === true) return 'sandbox';
  if (input.providerMode === 'MOCK') return 'sandbox';
  return 'commerce';
}

export function esimOpsCurrency(gateway: string): 'USD' | 'VND' {
  return gateway.trim().toUpperCase() === 'PAYPAL' ? 'USD' : 'VND';
}

/** One SUCCESS payment per order: latest paidAt, then createdAt. */
export function pickUniqueSuccessPayments<T extends EsimOpsDashboardPayment>(payments: T[]): T[] {
  const byOrder = new Map<string, T>();
  for (const payment of payments) {
    const current = byOrder.get(payment.orderId);
    if (!current || paymentTime(payment) >= paymentTime(current)) {
      byOrder.set(payment.orderId, payment);
    }
  }
  return [...byOrder.values()];
}

export function addMoney(left: string, right: string): string {
  return new Decimal(left || '0').plus(right || '0').toFixed(2);
}

export function sanitizeEsimOpsAuditMetadata(metadata: unknown): Record<string, unknown> {
  const source = asRecord(metadata);
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (SECRET_KEY.test(key)) continue;
    if (typeof value === 'string' && /LPA:1\$/i.test(value)) continue;
    if (
      value === null ||
      typeof value === 'boolean' ||
      typeof value === 'number' ||
      (typeof value === 'string' && value.length <= 240)
    ) {
      safe[key] = value;
    }
  }
  return safe;
}

export function buildEsimOpsDashboard(input: {
  range: EsimOpsRange;
  ordersCreated: EsimOpsDashboardOrder[];
  paymentOrders?: EsimOpsDashboardOrder[];
  successPayments: EsimOpsDashboardPayment[];
  packages: Map<string, { countryIso: string; title: string }>;
}) {
  const created = {
    commerce: input.ordersCreated.filter((row) => esimOpsLane(row) === 'commerce'),
    sandbox: input.ordersCreated.filter((row) => esimOpsLane(row) === 'sandbox'),
  };
  const uniquePayments = pickUniqueSuccessPayments(input.successPayments);
  const paymentByOrder = new Map(uniquePayments.map((row) => [row.orderId, row]));
  const orderById = new Map(
    [...(input.paymentOrders ?? []), ...input.ordersCreated].map((row) => [row.id, row]),
  );

  const revenue = {
    commerce: [] as EsimOpsMoneyBucket[],
    sandbox: [] as EsimOpsMoneyBucket[],
  };
  const snapshotCost = {
    commerce: [] as EsimOpsMoneyBucket[],
    sandbox: [] as EsimOpsMoneyBucket[],
  };
  let costComplete = true;

  for (const payment of uniquePayments) {
    const order = orderById.get(payment.orderId);
    const lane = order ? esimOpsLane(order) : 'commerce';
    const currency = esimOpsCurrency(payment.gateway);
    addBucket(revenue[lane], currency, payment.gateway, payment.amount);
    if (!order) {
      costComplete = false;
      continue;
    }
    if (!new Decimal(order.providerCost || '0').gt(0)) costComplete = false;
    addBucket(snapshotCost[lane], currency, payment.gateway, order.providerCost || '0');
  }

  const fulfillment = countBy(
    created.commerce.concat(created.sandbox),
    (row) => row.fulfillmentStatus,
  );
  const payment = countBy(
    created.commerce.concat(created.sandbox),
    (row) => row.paymentStatus,
  );

  const commercialPaid = created.commerce.filter((row) => row.paymentStatus === 'PAID');
  const commercialCompleted = commercialPaid.filter((row) => row.fulfillmentStatus === 'COMPLETED');
  const paidUnfulfilled = input.ordersCreated.filter(
    (row) => row.paymentStatus === 'PAID' && row.fulfillmentStatus !== 'COMPLETED',
  );

  const packages = new Map<
    string,
    { code: string; title: string; countryIso: string; orders: number; commercePaid: number }
  >();
  const countries = new Map<string, { countryIso: string; orders: number; commercePaid: number }>();
  for (const order of created.commerce) {
    const code = order.providerProductCode ?? 'unknown';
    const pack = input.packages.get(code);
    const title = pack?.title ?? code;
    const countryIso = pack?.countryIso ?? 'UNKNOWN';
    const currentPack = packages.get(code) ?? {
      code,
      title,
      countryIso,
      orders: 0,
      commercePaid: 0,
    };
    currentPack.orders += 1;
    if (order.paymentStatus === 'PAID') currentPack.commercePaid += 1;
    packages.set(code, currentPack);
    const currentCountry = countries.get(countryIso) ?? {
      countryIso,
      orders: 0,
      commercePaid: 0,
    };
    currentCountry.orders += 1;
    if (order.paymentStatus === 'PAID') currentCountry.commercePaid += 1;
    countries.set(countryIso, currentCountry);
  }

  return {
    range: {
      from: input.range.from.toISOString(),
      to: input.range.to.toISOString(),
      preset: input.range.preset,
    },
    definitions: {
      orderCounts: 'Đơn eSIM B2C tạo trong khoảng (createdAt). Không gồm thẻ/nạp.',
      revenue:
        'Tổng amount của payment status=SUCCESS, một payment/order (paidAt mới nhất). Tách currency theo cổng: PAYPAL=USD, còn lại=VND. Không dùng customerPaid của đơn chưa SUCCESS.',
      installSuccessRate:
        'Mẫu số: đơn commerce (LIVE, không adminTest/sandbox) có paymentStatus=PAID trong khoảng tạo đơn. Tử số: trong đó fulfillmentStatus=COMPLETED.',
      sandbox:
        'MOCK quote, clientTrace.adminTest hoặc clientTrace.sandbox. LIVE trên Partner Sandbox Airalo vẫn nằm lane commerce vì schema không lưu tài khoản Airalo.',
      grossProfit:
        'Không đối soát hóa đơn Airalo. Snapshot providerCost lúc tạo đơn chỉ tham khảo; không dùng làm lợi nhuận vận hành.',
    },
    orders: {
      total: input.ordersCreated.length,
      commerce: created.commerce.length,
      sandbox: created.sandbox.length,
      unpaid: input.ordersCreated.filter((row) => row.paymentStatus !== 'PAID').length,
      paid: input.ordersCreated.filter((row) => row.paymentStatus === 'PAID').length,
      paidUnfulfilled: paidUnfulfilled.length,
      completed: input.ordersCreated.filter(
        (row) => row.paymentStatus === 'PAID' && row.fulfillmentStatus === 'COMPLETED',
      ).length,
      processing: input.ordersCreated.filter((row) => row.fulfillmentStatus === 'PROCESSING').length,
      needManualReview: input.ordersCreated.filter(
        (row) => row.fulfillmentStatus === 'NEED_MANUAL_REVIEW',
      ).length,
      waitingAdminRetry: input.ordersCreated.filter(
        (row) => row.fulfillmentStatus === 'WAITING_ADMIN_RETRY',
      ).length,
      failed: input.ordersCreated.filter((row) => row.fulfillmentStatus === 'FAILED').length,
      payment,
      fulfillment,
    },
    installSuccessRate: {
      numerator: commercialCompleted.length,
      denominator: commercialPaid.length,
      rate:
        commercialPaid.length === 0
          ? null
          : Number((commercialCompleted.length / commercialPaid.length).toFixed(4)),
    },
    revenue: {
      commerce: revenue.commerce,
      sandbox: revenue.sandbox,
    },
    checkoutCostSnapshot: {
      available: false,
      reason:
        'Giá vốn/lợi nhuận gộp chưa khả dụng: chưa đối soát hóa đơn Airalo và phí cổng thực thu. Snapshot providerCost lúc tạo đơn không dùng làm KPI.',
      amounts: snapshotCost.commerce,
      costComplete,
    },
    topPackages: [...packages.values()]
      .sort((a, b) => b.commercePaid - a.commercePaid || b.orders - a.orders)
      .slice(0, 10),
    countries: [...countries.values()].sort(
      (a, b) => b.commercePaid - a.commercePaid || b.orders - a.orders,
    ),
    paidUnfulfilledOrderIds: paidUnfulfilled.map((row) => row.id),
    matchedSuccessPayments: uniquePayments.length,
    unmatchedSuccessPayments: uniquePayments.filter((row) => !orderById.has(row.orderId)).length,
    successPaymentOrderIds: [...paymentByOrder.keys()],
  };
}

function addBucket(
  buckets: EsimOpsMoneyBucket[],
  currency: string,
  gateway: string,
  amount: string,
) {
  const current = buckets.find((row) => row.currency === currency && row.gateway === gateway);
  if (current) {
    current.amount = addMoney(current.amount, amount);
    current.payments += 1;
    return;
  }
  buckets.push({ currency, gateway, amount: addMoney('0', amount), payments: 1 });
}

function countBy<T>(rows: T[], key: (row: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const value = key(row) || 'UNKNOWN';
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function paymentTime(payment: EsimOpsDashboardPayment): number {
  return (payment.paidAt ?? payment.createdAt).getTime();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function vnYmd(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function vnStart(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00${VN_TZ}`);
}

function shiftCalendarDay(isoDate: string, delta: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + delta));
  return `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())}`;
}
