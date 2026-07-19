/**
 * Refund state preparation (Phase 2E.1 — documented, not implemented).
 *
 * Future order.payment_status / payments.status flow:
 *
 *   PAID → REFUND_PENDING → REFUNDED
 *
 * REFUND_PENDING:
 * - Admin or gateway initiated refund in progress
 * - Order fulfillment frozen
 * - Ledger adjustment queued (future)
 *
 * REFUNDED:
 * - Terminal state — payment reversed
 * - Order may remain PAID with fulfillment COMPLETED (digital goods policy TBD)
 * - Never auto-refund on provider failure (see 06_ORDER_FULFILLMENT.md)
 */
export const PAYMENT_REFUND_RULES = {
  futureOrderStatuses: ['REFUND_PENDING', 'REFUNDED'] as const,
  futurePaymentStatuses: ['REFUND_PENDING', 'REFUNDED'] as const,
  notes:
    'REFUND_PENDING/REFUNDED enums deferred — use PaymentProviderInterface.refund() in gateway phase',
} as const;

/**
 * Late SUCCESS webhook on expired payment — manual review handling.
 */
export const PAYMENT_LATE_WEBHOOK_RULES = {
  action: 'MANUAL_REVIEW' as const,
  behavior: {
    markOrderPaid: false,
    markPaymentSuccess: false,
    storePayloadInGatewayResponse: true,
    returnHttp200: true,
  },
} as const;
