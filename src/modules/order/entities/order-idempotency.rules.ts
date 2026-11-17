/**
 * Checkout / payment idempotency rules (Phase 2D.1 — documented).
 *
 * Retail B2C POST /orders requires Idempotency-Key → orders.checkout_idempotency_key.
 * Same key returns the original order (owner / guestEmail checked). eSIM lane still has its
 * own in-flight reuse for user+variant.
 *
 * Payment phase:
 *
 * 1. Idempotency-Key header on payment creation
 *    - Same key returns existing payment_url (HTTP 200)
 *
 * 2. payments.payment_reference as webhook idempotency key (per 06_ORDER_FULFILLMENT.md)
 *
 * 3. Before marking PAID, call assertCanMarkPaid() — reject EXPIRED / past payment_expires_at
 *
 * 4. Optional: Redis lock on orderId during payment initiation (prevent double gateway session)
 */
export const ORDER_IDEMPOTENCY_RULES = {
  orderCreation: {
    currentBehavior:
      'POST /orders with Idempotency-Key stores orders.checkout_idempotency_key and replays the same order. eSIM also reuses in-flight user+variant orders.',
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
