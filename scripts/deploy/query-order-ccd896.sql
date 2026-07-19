SELECT o.order_code, o.fulfillment_status, o.payment_status FROM orders o WHERE o.order_code = 'ORD-20260714-CCD896';

SELECT pt.status, pt.request_id, pt.error_code, LEFT(COALESCE(pt.error_message,''), 300) AS err
FROM provider_transactions pt JOIN orders o ON o.id = pt.order_id
WHERE o.order_code = 'ORD-20260714-CCD896';

SELECT tt.status, tt.phone_number, tt.telco, tt.amount, LEFT(COALESCE(tt.result_message,''), 200) AS msg
FROM topup_transactions tt JOIN orders o ON o.id = tt.order_id
WHERE o.order_code = 'ORD-20260714-CCD896';
