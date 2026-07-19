SELECT o.order_code, o.fulfillment_status, pt.request_id, pt.status, pl.request_payload, pl.response_payload
FROM orders o
JOIN provider_transactions pt ON pt.order_id = o.id
LEFT JOIN provider_logs pl ON pl.request_id = pt.request_id
WHERE o.order_code = 'ORD-20260714-3DAB27'
ORDER BY pt.created_at DESC
LIMIT 3;
