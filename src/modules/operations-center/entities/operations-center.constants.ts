export const OPERATIONS_PERMISSIONS = {
  RECONCILIATION_READ: 'reconciliation.read',
  RECONCILIATION_MANAGE: 'reconciliation.manage',
  OPERATIONS_MANAGE: 'operations.manage',
  INVOICE_READ: 'invoice.read',
  INVOICE_MANAGE: 'invoice.manage',
} as const;

export type OperationsExceptionStatus = 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'IGNORED';

export type OperationsMismatchSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export const OPERATIONS_MISMATCH_TYPES = [
  'PAYMENT_RECEIVED_NO_ORDER',
  'ORDER_NO_PIN',
  'PIN_DELIVERED_NO_LEDGER',
  'WEBHOOK_UNPROCESSED',
  'PROVIDER_SUCCESS_ORDER_FAILED',
  'LEDGER_MISMATCH',
  'GATEWAY_MISMATCH',
  'PROVIDER_TIMEOUT',
  'WEBHOOK_FAILED',
  'PAYMENT_MISMATCH',
  'DUPLICATE_PAYMENT',
  'DUPLICATE_WEBHOOK',
  'PENDING_TOO_LONG',
  'NO_PROVIDER_RESPONSE',
  'UNKNOWN',
] as const;

export type OperationsMismatchType = (typeof OPERATIONS_MISMATCH_TYPES)[number];

export const MANUAL_OPERATION_ACTIONS = [
  'replay_webhook',
  'recheck_provider',
  'resend_pin',
  'rebuild_ledger_summary',
  'mark_reconciled',
  'resend_email',
  'send_telegram',
  'create_note',
  'lock_order',
  'unlock_order',
  'cancel_safely',
] as const;

export type ManualOperationAction = (typeof MANUAL_OPERATION_ACTIONS)[number];
