/**
 * Phase 2E.4 — Payment success → fulfillment queue flow (documented, not implemented).
 *
 * Future flow after webhook confirms payment:
 *
 *   Webhook received
 *       ↓
 *   PaymentService.handleWebhook()
 *       ↓
 *   Mark payment SUCCESS (payments.status)
 *       ↓
 *   Mark order PAID (orders.payment_status) — atomic transaction
 *       ↓
 *   Push provider_queue job { orderId, paymentId, triggeredBy: 'webhook' }
 *       ↓
 *   ProviderWorker → ProviderInterface.buyCard() (Phase 2F)
 *
 * Rules:
 * - Webhook handler NEVER calls provider API inline (see 03_PAYMENT.md, 17_QUEUE_REGISTRY.md)
 * - Queue push happens AFTER DB commit (same request, post-transaction)
 * - Idempotent: duplicate webhook must NOT enqueue duplicate fulfillment jobs
 * - invoice_queue push deferred to fulfillment phase
 *
 * Related queues (17_QUEUE_REGISTRY.md):
 * - provider_queue — B2C card delivery after PAID
 * - payment_queue — expiration only (already implemented via PaymentExpirationService)
 */
export const PAYMENT_SUCCESS_QUEUE_RULES = {
  queueName: 'provider_queue' as const,
  jobPayload: {
    orderId: 'string',
    paymentId: 'string',
    triggeredBy: 'webhook' as const,
  },
  enqueueAfter: ['payment SUCCESS', 'order PAID'] as const,
  skipWhen: ['duplicate webhook', 'manualReview late payment'] as const,
  notImplementedInPhase: '2E.4 — enqueue stub only, no ProviderWorker',
} as const;
