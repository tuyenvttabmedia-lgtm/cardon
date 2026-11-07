import { formatVnd } from '@/lib/utils';
import type { EsimOpsDetail, EsimOpsListItem } from '@/types/api';

export function formatEsimMoney(amount: string | null | undefined, currency: string | null | undefined): string {
  if (amount == null || amount === '') return '—';
  const value = Number(amount);
  if (!Number.isFinite(value)) return '—';
  if ((currency ?? '').toUpperCase() === 'USD') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  }
  return formatVnd(amount);
}

/** Sum gateway buckets per currency. Never converts or merges currencies. */
export function sumMoneyBucketsByCurrency(
  rows: Array<{ currency: string; amount: string; payments: number }>,
): Array<{ currency: string; amount: string; payments: number }> {
  const map = new Map<string, { amount: number; payments: number }>();
  for (const row of rows) {
    const currency = (row.currency || '').toUpperCase();
    if (!currency) continue;
    const amount = Number(row.amount);
    if (!Number.isFinite(amount)) continue;
    const prev = map.get(currency) ?? { amount: 0, payments: 0 };
    prev.amount += amount;
    prev.payments += row.payments;
    map.set(currency, prev);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, value]) => ({
      currency,
      amount: String(value.amount),
      payments: value.payments,
    }));
}

export function pickCurrencyBucket(
  rows: Array<{ currency: string; amount: string; payments: number }>,
  currency: string,
): { currency: string; amount: string; payments: number } | null {
  const code = currency.toUpperCase();
  return rows.find((row) => row.currency.toUpperCase() === code) ?? null;
}

export function gatewayLabel(gateway: string | null | undefined): string {
  const code = (gateway ?? '').toUpperCase();
  if (code === 'SEPAY') return 'Chuyển khoản (Viet QR)';
  if (code === 'PAYPAL') return 'PayPal';
  return gateway || '—';
}

export function paymentTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  const value = status.toUpperCase();
  if (['PAID', 'SUCCESS', 'COMPLETED'].includes(value)) return 'success';
  if (['WAITING_PAYMENT', 'PENDING', 'PROCESSING'].includes(value)) return 'warning';
  if (['FAILED', 'EXPIRED', 'REFUNDED', 'VOID'].includes(value)) return 'danger';
  return 'neutral';
}

export function fulfillmentTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  const value = status.toUpperCase();
  if (value === 'COMPLETED') return 'success';
  if (['PROCESSING', 'PENDING'].includes(value)) return 'warning';
  if (['NEED_MANUAL_REVIEW', 'WAITING_ADMIN_RETRY', 'FAILED'].includes(value)) return 'danger';
  return 'neutral';
}

export function listChargeLabel(item: EsimOpsListItem): string {
  if (item.chargeAmount && item.chargeCurrency) {
    return formatEsimMoney(item.chargeAmount, item.chargeCurrency);
  }
  return formatVnd(item.customerPaid);
}

export type TimelineStepState = 'done' | 'current' | 'todo' | 'failed';

export type TimelineStep = {
  id: string;
  title: string;
  state: TimelineStepState;
  at: string | null;
  note?: string | null;
};

/**
 * Evidence-based progress only. Never invent timestamps or mark a step done
 * without a matching field on the detail payload.
 */
export function buildEsimOrderTimeline(detail: EsimOpsDetail): TimelineStep[] {
  const paid = detail.paymentStatus === 'PAID';
  const paymentFailed = ['EXPIRED', 'FAILED', 'REFUNDED'].includes(detail.paymentStatus);
  const payments = detail.payments ?? [];
  const firstPayment = payments[0] ?? null;
  const successPayment = payments.find((row) => row.status.toUpperCase() === 'SUCCESS' || Boolean(row.paidAt));
  const createAttempt = detail.attempts.find((row) => row.operation === 'CREATE');
  const queryAttempt = [...detail.attempts].reverse().find((row) => row.operation === 'QUERY');
  const hasProviderOrder = Boolean(detail.airaloOrderId);
  const hasProfile = Boolean(detail.profilePresent);
  const fulfillFailed = ['FAILED', 'NEED_MANUAL_REVIEW', 'WAITING_ADMIN_RETRY'].includes(detail.fulfillmentStatus)
    && paid
    && !hasProfile;

  const paymentInitDone = payments.length > 0;
  const paymentSuccessDone = paid || Boolean(successPayment);
  const fulfillSentDone = Boolean(createAttempt) || hasProviderOrder || hasProfile;
  const providerDone = hasProviderOrder || hasProfile;
  const profileDone = hasProfile;
  const completeDone = detail.fulfillmentStatus === 'COMPLETED' && hasProfile;

  return [
    {
      id: 'created',
      title: 'Đơn hàng được tạo',
      state: 'done',
      at: detail.createdAt,
    },
    {
      id: 'pay-init',
      title: 'Thanh toán được khởi tạo',
      state: paymentInitDone ? 'done' : paymentFailed ? 'failed' : 'current',
      at: firstPayment?.createdAt ?? null,
      note: firstPayment ? firstPayment.paymentReference : null,
    },
    {
      id: 'pay-ok',
      title: 'Thanh toán thành công',
      state: paymentSuccessDone
        ? 'done'
        : paymentFailed
          ? 'failed'
          : paymentInitDone
            ? 'current'
            : 'todo',
      at: successPayment?.paidAt ?? null,
      note: paymentFailed ? detail.paymentStatus : null,
    },
    {
      id: 'fulfill-sent',
      title: 'Gửi yêu cầu cấp eSIM',
      state: !paymentSuccessDone
        ? 'todo'
        : fulfillSentDone
          ? 'done'
          : fulfillFailed
            ? 'failed'
            : 'current',
      at: createAttempt?.createdAt ?? null,
      note: createAttempt?.operation ?? null,
    },
    {
      id: 'provider',
      title: 'Nhà cung cấp xử lý',
      state: !fulfillSentDone
        ? 'todo'
        : providerDone
          ? 'done'
          : fulfillFailed
            ? 'failed'
            : 'current',
      at: createAttempt?.completedAt ?? createAttempt?.createdAt ?? null,
      note: detail.airaloOrderId,
    },
    {
      id: 'profile',
      title: 'Lưu mã cài eSIM',
      state: !providerDone
        ? 'todo'
        : profileDone
          ? 'done'
          : fulfillFailed
            ? 'failed'
            : 'current',
      at: queryAttempt?.completedAt ?? (profileDone ? queryAttempt?.createdAt ?? null : null),
      note: profileDone ? 'Đã lưu' : detail.lastError,
    },
    {
      id: 'done',
      title: 'Hoàn tất',
      state: completeDone ? 'done' : profileDone ? 'current' : 'todo',
      at: completeDone ? (queryAttempt?.completedAt ?? detail.createdAt) : null,
    },
  ];
}
