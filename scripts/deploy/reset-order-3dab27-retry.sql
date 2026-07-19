UPDATE orders
SET fulfillment_status = 'WAITING_ADMIN_RETRY', updated_at = NOW()
WHERE order_code = 'ORD-20260714-3DAB27'
  AND fulfillment_status IN ('WAITING_ADMIN_RETRY', 'FAILED', 'PROCESSING');

SELECT id, order_code, fulfillment_status FROM orders WHERE order_code = 'ORD-20260714-3DAB27';
