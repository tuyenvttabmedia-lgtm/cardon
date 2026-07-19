SELECT o.id, o.order_code, o.fulfillment_status, pv.sku, ppm.provider_product_code, ppm.status AS mapping_status
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
JOIN product_variants pv ON pv.id = oi.variant_id
LEFT JOIN provider_product_mappings ppm ON ppm.product_variant_id = pv.id
WHERE o.order_code = 'ORD-20260714-3DAB27';
