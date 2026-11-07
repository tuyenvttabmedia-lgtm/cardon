import {
  addMoney,
  esimOpsCurrency,
  esimOpsLane,
  pickUniqueSuccessPayments,
  type EsimOpsDashboardOrder,
  type EsimOpsDashboardPayment,
  type EsimOpsMoneyBucket,
  type EsimOpsRange,
} from './esim-ops-dashboard';

export interface EsimFinanceCurrencyTotal {
  currency: string;
  amount: string;
  payments: number;
}

export interface EsimFinanceDayBucket {
  date: string;
  currency: string;
  gateway: string;
  amount: string;
  payments: number;
}

export interface EsimFinanceLaneRevenue {
  byCurrency: EsimFinanceCurrencyTotal[];
  byGateway: EsimOpsMoneyBucket[];
  byDay: EsimFinanceDayBucket[];
  paymentCount: number;
  /** Sum of order.paymentFeeAmount for matched SUCCESS payments — estimated only. */
  estimatedFeeByCurrency: EsimFinanceCurrencyTotal[];
}

export interface EsimFinanceRevenueReport {
  range: { from: string; to: string; preset: string };
  productLane: 'ESIM';
  definitions: {
    revenue: string;
    sandbox: string;
    estimatedFee: string;
    gatewayActualFee: string;
    byDay: string;
    noFx: string;
  };
  commerce: EsimFinanceLaneRevenue;
  sandbox: EsimFinanceLaneRevenue;
  gatewayActualFees: {
    status: 'UNAVAILABLE';
    note: string;
  };
  matchedSuccessPayments: number;
  unmatchedSuccessPayments: number;
}

/**
 * Finance revenue view. Same SUCCESS / one-payment-per-order / lane rules as Ops dashboard.
 * Never mixes VND+USD. Never converts FX.
 */
export function buildEsimFinanceRevenue(input: {
  range: EsimOpsRange;
  orders: EsimOpsDashboardOrder[];
  successPayments: EsimOpsDashboardPayment[];
}): EsimFinanceRevenueReport {
  const uniquePayments = pickUniqueSuccessPayments(input.successPayments);
  const orderById = new Map(input.orders.map((row) => [row.id, row]));

  const commerce = emptyLane();
  const sandbox = emptyLane();

  for (const payment of uniquePayments) {
    const order = orderById.get(payment.orderId);
    const lane = order ? esimOpsLane(order) : 'commerce';
    const target = lane === 'sandbox' ? sandbox : commerce;
    const currency = paymentCurrency(payment);
    const gateway = payment.gateway.trim().toUpperCase() || 'UNKNOWN';
    const day = vnYmd(payment.paidAt ?? payment.createdAt);

    addCurrency(target.byCurrency, currency, payment.amount);
    addGateway(target.byGateway, currency, gateway, payment.amount);
    addDay(target.byDay, day, currency, gateway, payment.amount);
    target.paymentCount += 1;

    if (order) {
      addCurrency(target.estimatedFeeByCurrency, currency, order.paymentFeeAmount || '0');
    }
  }

  return {
    range: {
      from: input.range.from.toISOString(),
      to: input.range.to.toISOString(),
      preset: input.range.preset,
    },
    productLane: 'ESIM',
    definitions: {
      revenue:
        'Tổng amount payment status=SUCCESS, một payment/order (paidAt mới nhất). Currency từ payment; trống thì PAYPAL=USD, còn lại=VND. Không cộng VND+USD. Không dùng order.total/customerPaid khi chưa SUCCESS.',
      sandbox:
        'MOCK quote, clientTrace.adminTest hoặc clientTrace.sandbox — tách khỏi thương mại.',
      estimatedFee:
        'paymentFeeAmount trên snapshot đơn — phí ước tính lúc checkout. Không phải phí gateway thực từ báo cáo SePay/PayPal (F2/F3).',
      gatewayActualFee:
        'Chưa có dữ liệu phí gateway thực trong F1. Đối soát fee thật thuộc F2 (SePay↔NH) và F3 (PayPal CSV).',
      byDay: 'Nhóm theo ngày paidAt (Asia/Ho_Chi_Minh); thiếu paidAt thì dùng createdAt payment.',
      noFx: 'Không quy đổi USD↔VND. Lợi nhuận kế toán chưa mở trong F1.',
    },
    commerce,
    sandbox,
    gatewayActualFees: {
      status: 'UNAVAILABLE',
      note: 'F1 chưa có phí gateway thực. Hiển thị trạng thái chưa có dữ liệu — không suy từ paymentFeeAmount.',
    },
    matchedSuccessPayments: uniquePayments.length,
    unmatchedSuccessPayments: uniquePayments.filter((row) => !orderById.has(row.orderId)).length,
  };
}

export function exportEsimFinanceRevenueCsv(report: EsimFinanceRevenueReport): string {
  const lines: string[] = [
    'section,lane,date,currency,gateway,amount,payments,note',
  ];
  for (const lane of ['commerce', 'sandbox'] as const) {
    const block = report[lane];
    for (const row of block.byCurrency) {
      lines.push(
        [
          'total',
          lane,
          '',
          row.currency,
          '',
          row.amount,
          String(row.payments),
          'commerce_only_for_commercial_report',
        ].join(','),
      );
    }
    for (const row of block.byGateway) {
      lines.push(
        ['gateway', lane, '', row.currency, row.gateway, row.amount, String(row.payments), ''].join(
          ',',
        ),
      );
    }
    for (const row of block.byDay) {
      lines.push(
        [
          'day',
          lane,
          row.date,
          row.currency,
          row.gateway,
          row.amount,
          String(row.payments),
          '',
        ].join(','),
      );
    }
    for (const row of block.estimatedFeeByCurrency) {
      lines.push(
        [
          'estimated_fee',
          lane,
          '',
          row.currency,
          '',
          row.amount,
          String(row.payments),
          'estimated_not_gateway_actual',
        ].join(','),
      );
    }
  }
  lines.push(
    [
      'gateway_actual_fee',
      '',
      '',
      '',
      '',
      '',
      '',
      report.gatewayActualFees.status,
    ].join(','),
  );
  return lines.join('\n');
}

function emptyLane(): EsimFinanceLaneRevenue {
  return {
    byCurrency: [],
    byGateway: [],
    byDay: [],
    paymentCount: 0,
    estimatedFeeByCurrency: [],
  };
}

function paymentCurrency(payment: EsimOpsDashboardPayment): string {
  const stored = payment.currency?.trim().toUpperCase();
  if (stored === 'USD' || stored === 'VND') return stored;
  return esimOpsCurrency(payment.gateway);
}

function addCurrency(buckets: EsimFinanceCurrencyTotal[], currency: string, amount: string) {
  const code = currency.trim().toUpperCase();
  const current = buckets.find((row) => row.currency === code);
  if (current) {
    current.amount = addMoney(current.amount, amount);
    current.payments += 1;
    return;
  }
  buckets.push({ currency: code, amount: addMoney('0', amount), payments: 1 });
}

function addGateway(
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

function addDay(
  buckets: EsimFinanceDayBucket[],
  date: string,
  currency: string,
  gateway: string,
  amount: string,
) {
  const current = buckets.find(
    (row) => row.date === date && row.currency === currency && row.gateway === gateway,
  );
  if (current) {
    current.amount = addMoney(current.amount, amount);
    current.payments += 1;
    return;
  }
  buckets.push({ date, currency, gateway, amount: addMoney('0', amount), payments: 1 });
}

function vnYmd(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}
