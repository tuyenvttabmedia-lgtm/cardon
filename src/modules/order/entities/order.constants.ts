import { OrderPaymentStatus, Prisma } from '@prisma/client';

export const ACTIVE_ORDER_WHERE: Prisma.OrderWhereInput = {
  deletedAt: null,
};

export const ORDER_AUDIT_ACTIONS = {
  ORDER_CREATED: 'ORDER_CREATED',
  ORDER_EXPIRED: 'ORDER_EXPIRED',
} as const;

export type OrderAuditAction =
  (typeof ORDER_AUDIT_ACTIONS)[keyof typeof ORDER_AUDIT_ACTIONS];

export const DEFAULT_PAYMENT_TIMEOUT_MINUTES = 15;

/** MegaPay giữ phiên VA/VNPAYQR 30 phút; đơn CardOn không được hết hạn sớm hơn phiên cổng. */
export const EXTERNAL_QR_MIN_TIMEOUT_MINUTES = 30;

const EXTENDED_PAYMENT_WINDOW_METHOD_CODES = new Set([
  'DEPOSIT_CODE',
  'VIETQR',
  'MEGAPAY_ATM',
  'VNPAYQR',
]);

export function requiresExtendedPaymentWindow(
  methodCode?: string | null,
): boolean {
  return EXTENDED_PAYMENT_WINDOW_METHOD_CODES.has(
    (methodCode ?? '').trim().toUpperCase(),
  );
}

export const SYSTEM_AUDIT_ACTOR_EMAIL = 'superadmin@cardon.vn';

export function isPaymentExpired(params: {
  paymentStatus: OrderPaymentStatus;
  paymentExpiresAt: Date | null;
  now?: Date;
}): boolean {
  if (params.paymentStatus !== OrderPaymentStatus.WAITING_PAYMENT) {
    return false;
  }
  if (!params.paymentExpiresAt) {
    return false;
  }
  const now = params.now ?? new Date();
  return params.paymentExpiresAt.getTime() < now.getTime();
}
