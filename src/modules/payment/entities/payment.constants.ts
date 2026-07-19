import { PaymentGatewayCode, PaymentRecordStatus } from '@prisma/client';

export const PAYMENT_AUDIT_ACTIONS = {
  PAYMENT_CREATED: 'PAYMENT_CREATED',
  PAYMENT_SUCCESS: 'PAYMENT_SUCCESS',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PAYMENT_DUPLICATE_WEBHOOK: 'PAYMENT_DUPLICATE_WEBHOOK',
} as const;

export type PaymentAuditAction =
  (typeof PAYMENT_AUDIT_ACTIONS)[keyof typeof PAYMENT_AUDIT_ACTIONS];

export const SYSTEM_AUDIT_ACTOR_EMAIL = 'superadmin@cardon.vn';

export const MOCK_WEBHOOK_SECRET = 'mock-payment-webhook-secret';

export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

export const ACTIVE_PAYMENT_WHERE = {
  deletedAt: null,
} as const;

export const TERMINAL_PAYMENT_STATUSES: PaymentRecordStatus[] = [
  PaymentRecordStatus.SUCCESS,
  PaymentRecordStatus.FAILED,
  PaymentRecordStatus.EXPIRED,
];

export function gatewayCodeFromParam(value: string): PaymentGatewayCode {
  const normalized = value.toUpperCase();
  if (normalized === PaymentGatewayCode.MEGAPAY) {
    return PaymentGatewayCode.MEGAPAY;
  }
  if (normalized === PaymentGatewayCode.SEPAY) {
    return PaymentGatewayCode.SEPAY;
  }
  throw new Error(`Unsupported gateway: ${value}`);
}
