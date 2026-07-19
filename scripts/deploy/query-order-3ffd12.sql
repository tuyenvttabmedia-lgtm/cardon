SELECT order_code, payment_status, fulfillment_status FROM orders WHERE order_code = 'ORD-20260714-3FFD12';

SELECT status, request_id, error_code, LEFT(COALESCE(error_message,''), 200) AS error_message
FROM provider_transactions WHERE order_id = '747fe1aa-7a60-4307-a2cd-8e01bc38f7e1'
ORDER BY created_at DESC LIMIT 3;

SELECT COUNT(*) AS card_count FROM card_records cr
JOIN order_items oi ON oi.id = cr.order_item_id
WHERE oi.order_id = '747fe1aa-7a60-4307-a2cd-8e01bc38f7e1';
