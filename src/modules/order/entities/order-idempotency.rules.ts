/**
 * Checkout / payment idempotency rules (Phase 2D.1 — documented).
 *
 * Current Order Core does NOT deduplicate rapid double-clicks on POST /orders.
 * Each submit creates a new order + financial_transaction row.
 *
 * Payment phase MUST implement:
 *
 * 1. Idempotency-Key header on checkout → payment creation
 *    - Same key within TTL returns existing payment_url (HTTP 200)
 *    - Key scoped to: userId OR guestEmail + cart fingerprint
 *
 * 2. payments.payment_reference as webhook idempotency key (per 06_ORDER_FULFILLMENT.md)
 *
 * 3. Before marking PAID, call assertCanMarkPaid() — reject EXPIRED / past payment_expires_at
 *
 * 4. Optional: Redis lock on orderId during payment initiation (prevent double gateway session)
 */
export const ORDER_IDEMPOTENCY_RULES = {
  orderCreation: {
    currentBehavior: 'Each POST /orders creates a new order (no dedup)',
    paymentPhaseRequirement:
      'Idempotency-Key on payment creation; webhook uses payment_reference',
  },
  protectedTransitions: ['EXPIRED → PAID', 'FAILED → PAID without new order'],
} as const;

export const ORDER_IMMUTABILITY_RULES = {
  frozenAfterPaid: [
    'orders.total_amount',
    'order_items.variant_id',
    'order_items.quantity',
    'order_items.unit_price',
    'order_items.total_amount',
  ],
  frozenAfterCompleted: ['all order + order_item financial fields', 'customer_note'],
  snapshottedAtCreation: [
    'order_items.unit_price',
    'orders.total_amount',
    'orders.invoice_metadata',
  ],
} as const;
