SELECT pt.request_id, pt.status, pt.request_payload, pt.response_payload,
       o.order_code, o.guest_phone, o.customer_note,
       pv.sku, pv.type, pv.face_value, pv.metadata,
       ppm.provider_product_code, ppm.status AS mapping_status
FROM provider_transactions pt
JOIN orders o ON o.id = pt.order_id
JOIN order_items oi ON oi.order_id = o.id
JOIN product_variants pv ON pv.id = oi.variant_id
LEFT JOIN provider_product_mappings ppm ON ppm.product_variant_id = pv.id AND ppm.provider_id = pt.provider_id
WHERE pt.request_id = 'PRV-B2E134EBAC754E428B7C52D0';
